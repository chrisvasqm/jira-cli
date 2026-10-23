import { HttpClient } from "../core/http.js";
import type { Issue } from "../core/jira-types.js";

export interface Board {
  id: number;
  name: string;
  type: string;
  location?: { projectKey?: string; projectName?: string };
}

export interface BoardColumn {
  name: string;
  statusIds: string[];
}

export interface Sprint {
  id: number;
  name: string;
  state: "future" | "active" | "closed";
}

interface Page<T> {
  values: T[];
  isLast: boolean;
}

interface IssuePage {
  issues: Issue[];
  total?: number;
}

interface BoardConfiguration {
  columnConfig: { columns: { name: string; statuses: { id: string }[] }[] };
}

export const ISSUE_LIST_FIELDS = "summary,status,issuetype,priority,assignee,updated";

/** /rest/agile/1.0/board endpoints. */
export class BoardService {
  constructor(private readonly http = HttpClient.get()) {}

  async listAll(): Promise<Board[]> {
    const boards: Board[] = [];
    let startAt = 0;
    for (;;) {
      const page = await this.http.get<Page<Board>>(`/rest/agile/1.0/board?startAt=${startAt}&maxResults=50`);
      boards.push(...page.values);
      if (page.isLast || page.values.length === 0) return boards;
      startAt += page.values.length;
    }
  }

  async columns(boardId: number): Promise<BoardColumn[]> {
    const cfg = await this.http.get<BoardConfiguration>(`/rest/agile/1.0/board/${boardId}/configuration`);
    return cfg.columnConfig.columns.map((col) => ({
      name: col.name,
      statusIds: col.statuses.map((status) => status.id),
    }));
  }

  async sprints(boardId: number, state: string): Promise<Sprint[]> {
    const page = await this.http.get<Page<Sprint>>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=${encodeURIComponent(state)}&maxResults=50`,
    );
    return page.values;
  }

  /** Issues visible on the board, optionally narrowed by JQL, up to `limit`. */
  async issues(
    boardId: number,
    jql: string | undefined,
    limit: number,
  ): Promise<{ issues: Issue[]; total: number }> {
    const issues: Issue[] = [];
    let total = 0;
    while (issues.length < limit) {
      const pageSize = Math.min(50, limit - issues.length);
      const params = new URLSearchParams({
        startAt: String(issues.length),
        maxResults: String(pageSize),
        fields: ISSUE_LIST_FIELDS,
      });
      if (jql) params.set("jql", jql);
      const page = await this.http.get<IssuePage>(`/rest/agile/1.0/board/${boardId}/issue?${params}`);
      issues.push(...page.issues);
      total = page.total ?? issues.length;
      if (page.issues.length === 0 || issues.length >= total) break;
    }
    return { issues, total };
  }
}
