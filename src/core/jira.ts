import { CliError } from "./errors.js";

export interface Credentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface Myself {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface Board {
  id: number;
  name: string;
  type: string;
  location?: { projectKey?: string; projectName?: string };
}

export class JiraClient {
  private readonly auth: string;

  constructor(private readonly creds: Credentials) {
    this.auth = `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")}`;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.creds.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: this.auth, Accept: "application/json", ...init.headers },
    });
    if (res.status === 401 || res.status === 403) {
      throw new CliError("AUTH_FAILED", "Jira rejected the credentials (check email, token, and URL).");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new CliError("JIRA_ERROR", `Jira returned ${res.status} for ${path}`, body);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  myself(): Promise<Myself> {
    return this.request<Myself>("/rest/api/3/myself");
  }

  async listBoards(): Promise<Board[]> {
    const boards: Board[] = [];
    let startAt = 0;
    for (;;) {
      const page = await this.request<{ values: Board[]; isLast: boolean; maxResults: number }>(
        `/rest/agile/1.0/board?startAt=${startAt}&maxResults=50`,
      );
      boards.push(...page.values);
      if (page.isLast) return boards;
      startAt += page.maxResults;
    }
  }
}
