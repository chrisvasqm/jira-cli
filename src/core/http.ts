import { CliError } from "./errors.js";

export interface Credentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryPolicy = { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 8000 };
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** Single networking entry point: auth header, JSON encoding, retries with exponential backoff. */
export class HttpClient {
  private static instance: HttpClient | undefined;

  static configure(creds: Credentials, retry: Partial<RetryPolicy> = {}): HttpClient {
    HttpClient.instance = new HttpClient(creds, { ...DEFAULT_RETRY, ...retry });
    return HttpClient.instance;
  }

  static get(): HttpClient {
    if (!HttpClient.instance) {
      throw new CliError("HTTP_NOT_CONFIGURED", "HttpClient.configure() must run before any request.");
    }
    return HttpClient.instance;
  }

  private readonly authHeader: string;

  private constructor(
    private readonly creds: Credentials,
    private readonly retry: RetryPolicy,
  ) {
    const raw = `${creds.email}:${creds.apiToken}`;
    this.authHeader = `Basic ${Buffer.from(raw).toString("base64")}`;
  }

  /** GET is retried on transient failures. */
  get<T>(path: string): Promise<T> {
    return this.send<T>("GET", path, undefined, true);
  }

  /** Writes are never retried: Jira may already have applied them. */
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
      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (err) {
        if (!idempotent || attempt >= this.retry.maxRetries) {
          throw new CliError("NETWORK_ERROR", `Could not reach ${this.creds.baseUrl}`, String(err));
        }
        await sleep(this.backoff(attempt));
        continue;
      }

      if (idempotent && RETRYABLE_STATUS.has(res.status) && attempt < this.retry.maxRetries) {
        await sleep(this.backoff(attempt, res.headers.get("Retry-After")));
        continue;
      }
      return this.decode<T>(res, method, path);
    }
  }

  private async decode<T>(res: Response, method: string, path: string): Promise<T> {
    if (res.status === 401 || res.status === 403) {
      throw new CliError("AUTH_FAILED", "Jira rejected the credentials (check email, token, and URL).");
    }
    if (res.status === 404) {
      throw new CliError("NOT_FOUND", `Jira has no resource at ${path}`);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new CliError("JIRA_ERROR", `${method} ${path} returned ${res.status}`, parseJson(text) ?? text);
    }
    const text = await res.text();
    if (text.trim() === "") return undefined as T;
    return JSON.parse(text) as T;
  }

  private backoff(attempt: number, retryAfter?: string | null): number {
    const fromHeader = retryAfter ? Number(retryAfter) * 1000 : Number.NaN;
    if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.min(fromHeader, this.retry.maxDelayMs);
    const exponential = this.retry.baseDelayMs * 2 ** attempt;
    const jitter = Math.random() * this.retry.baseDelayMs;
    return Math.min(exponential + jitter, this.retry.maxDelayMs);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
