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

export interface BoardConfig {
  type: "scrum" | "kanban" | "simple" | string;
  columns: BoardColumn[];
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
  type: string;
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

  async configuration(boardId: number): Promise<BoardConfig> {
    const cfg = await this.http.get<BoardConfiguration>(`/rest/agile/1.0/board/${boardId}/configuration`);
    return {
      type: cfg.type,
      columns: cfg.columnConfig.columns.map((col) => ({
        name: col.name,
        statusIds: col.statuses.map((status) => status.id),
      })),
    };
  }

  async sprints(boardId: number, state: string): Promise<Sprint[]> {
    const page = await this.http.get<Page<Sprint>>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=${encodeURIComponent(state)}&maxResults=50`,
    );
    return page.values;
  }

  /**
   * Issues matching the board filter, optionally narrowed by JQL, up to `limit`.
   * `hasMore` says whether the limit cut the list short; `total` is Jira's count when given.
   */
  async issues(
    boardId: number,
    jql: string | undefined,
    limit: number,
  ): Promise<{ issues: Issue[]; total: number; hasMore: boolean }> {
    const issues: Issue[] = [];
    let total: number | undefined;
    let hasMore = true;
    while (issues.length < limit && hasMore) {
      const pageSize = Math.min(50, limit - issues.length);
      const params = new URLSearchParams({
        startAt: String(issues.length),
        maxResults: String(pageSize),
        fields: ISSUE_LIST_FIELDS,
      });
      if (jql) params.set("jql", jql);
      const page = await this.http.get<IssuePage>(`/rest/agile/1.0/board/${boardId}/issue?${params}`);
      issues.push(...page.issues);
      total = page.total ?? total;
      hasMore = page.issues.length === pageSize && (total === undefined || issues.length < total);
    }
    return { issues, total: total ?? issues.length, hasMore };
  }
}
