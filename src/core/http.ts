import { setTimeout as sleep } from "node:timers/promises";
import { CliError } from "./errors.js";

interface Credentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
/** A request that gets no answer in this time fails (and a GET is retried). */
const REQUEST_TIMEOUT_MS = 30_000;
/** Longest Retry-After wait the client honors. */
const MAX_RETRY_AFTER_MS = 60_000;

/** Single networking entry point: auth header, JSON encoding, retries with exponential backoff. */
export class HttpClient {
  private static instance: HttpClient | undefined;

  static configure(creds: Credentials): void {
    HttpClient.instance = new HttpClient(creds);
  }

  static get(): HttpClient {
    if (!HttpClient.instance) {
      throw new CliError("HTTP_NOT_CONFIGURED", "HttpClient.configure() must run before any request.");
    }
    return HttpClient.instance;
  }

  private readonly authHeader: string;

  private constructor(private readonly creds: Credentials) {
    const raw = `${creds.email}:${creds.apiToken}`;
    this.authHeader = `Basic ${Buffer.from(raw).toString("base64")}`;
  }

  /** GET is retried on transient failures; writes only on 429, which Jira never applied. */
  get<T>(path: string): Promise<T> {
    return this.send<T>("GET", path, undefined, true);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>("POST", path, body, false);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>("PUT", path, body, false);
  }

  delete<T>(path: string): Promise<T> {
    return this.send<T>("DELETE", path, undefined, false);
  }

  private async send<T>(method: string, path: string, body: unknown, idempotent: boolean): Promise<T> {
    const url = `${this.creds.baseUrl}${path}`;
    const headers: Record<string, string> = { Authorization: this.authHeader, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      const more = attempt < MAX_RETRIES;
      const res = await this.attempt(url, init, idempotent && more);
      if (res === undefined) {
        await sleep(this.backoff(attempt));
        continue;
      }
      const retryable = res.status === 429 || (idempotent && RETRYABLE_STATUS.has(res.status));
      if (more && retryable) {
        await res.body?.cancel();
        await sleep(this.backoff(attempt, res.headers.get("Retry-After")));
        continue;
      }
      return this.decode<T>(res, method, path);
    }
  }

  /** Returns undefined when the network failed and a retry is allowed. */
  private async attempt(url: string, init: RequestInit, canRetry: boolean): Promise<Response | undefined> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      if (canRetry) return undefined;
      throw new CliError("NETWORK_ERROR", `Could not reach ${this.creds.baseUrl}`, networkReason(err));
    }
  }

  private async decode<T>(res: Response, method: string, path: string): Promise<T> {
    if (res.status === 401) {
      throw new CliError("AUTH_FAILED", "Jira rejected the credentials (check email, token, and URL).");
    }
    if (res.status === 404) {
      throw new CliError(
        "NOT_FOUND",
        `Jira has no resource at ${path} (check that ${this.creds.baseUrl} is your Jira site)`,
      );
    }
    const text = await res.text();
    if (res.status === 403) {
      throw new CliError(
        "FORBIDDEN",
        `Your account lacks permission for ${method} ${path}`,
        parseJson(text) ?? text,
      );
    }
    if (!res.ok) {
      throw new CliError(
        "JIRA_ERROR",
        `${method} ${path} returned ${res.status}`,
        parseJson(text) ?? text,
        res.status,
      );
    }
    if (text.trim() === "") return undefined as T;
    const parsed = parseJson(text);
    if (parsed === undefined) {
      throw new CliError(
        "INVALID_RESPONSE",
        `${method} ${path} did not return JSON. Is ${this.creds.baseUrl} a Jira site?`,
      );
    }
    return parsed as T;
  }

  private backoff(attempt: number, retryAfter?: string | null): number {
    const fromHeader = retryAfterMs(retryAfter);
    if (fromHeader !== undefined) return Math.min(fromHeader, MAX_RETRY_AFTER_MS);
    const exponential = BASE_DELAY_MS * 2 ** attempt;
    const jitter = Math.random() * BASE_DELAY_MS;
    return Math.min(exponential + jitter, MAX_DELAY_MS);
  }
}

/** Retry-After as seconds or an HTTP date, in ms from now. */
function retryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/** undici reports "fetch failed"; the real reason (DNS, TLS, refused) is in `cause`. */
function networkReason(err: unknown): string {
  if (err instanceof Error && err.name === "TimeoutError") {
    return `No answer after ${REQUEST_TIMEOUT_MS / 1000}s`;
  }
  const cause = err instanceof Error ? err.cause : undefined;
  if (cause instanceof Error) return `${err instanceof Error ? err.message : String(err)}: ${cause.message}`;
  return String(err);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
