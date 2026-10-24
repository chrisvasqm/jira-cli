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
/** Uploads and downloads may move large files, so they get longer. */
const TRANSFER_TIMEOUT_MS = 300_000;
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

  /** Multipart POST (field `file`); Jira blocks it without the no-check token header. Retried only on 429. */
  async upload<T>(path: string, form: FormData): Promise<T> {
    const init: RequestInit = { method: "POST", headers: { "X-Atlassian-Token": "no-check" }, body: form };
    const res = await this.request(path, init, false, TRANSFER_TIMEOUT_MS);
    return this.decode<T>(res, "POST", path);
  }

  /** GET of a binary body; the caller reads the stream. Errors map like any request. */
  async download(path: string): Promise<ReadableStream<Uint8Array>> {
    const init: RequestInit = { method: "GET", headers: { Accept: "*/*" } };
    const res = await this.request(path, init, true, TRANSFER_TIMEOUT_MS);
    if (!res.ok) return this.decode<never>(res, "GET", path);
    return res.body ?? new Blob([]).stream();
  }

  private async send<T>(method: string, path: string, body: unknown, idempotent: boolean): Promise<T> {
    const init: RequestInit = { method, headers: {} };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await this.request(path, init, idempotent, REQUEST_TIMEOUT_MS);
    return this.decode<T>(res, method, path);
  }

  /** Adds auth, retries transient failures; returns the final response, ok or not. */
  private async request(
    path: string,
    init: RequestInit,
    idempotent: boolean,
    timeoutMs: number,
  ): Promise<Response> {
    const url = `${this.creds.baseUrl}${path}`;
    const headers = { Accept: "application/json", ...(init.headers as Record<string, string>) };
    const full: RequestInit = { ...init, headers: { ...headers, Authorization: this.authHeader } };

    for (let attempt = 0; ; attempt++) {
      const more = attempt < MAX_RETRIES;
      const res = await this.attempt(url, full, idempotent && more, timeoutMs);
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
      return res;
    }
  }

  /** Returns undefined when the network failed and a retry is allowed. */
  private async attempt(
    url: string,
    init: RequestInit,
    canRetry: boolean,
    timeoutMs: number,
  ): Promise<Response | undefined> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (canRetry) return undefined;
      throw new CliError(
        "NETWORK_ERROR",
        `Could not reach ${this.creds.baseUrl}`,
        networkReason(err, timeoutMs),
      );
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
function networkReason(err: unknown, timeoutMs: number): string {
  if (err instanceof Error && err.name === "TimeoutError") {
    return `No answer after ${timeoutMs / 1000}s`;
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
