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
  /** "scrum", "kanban" or "simple" as reported by Jira. */
  type: string;
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

  listAll(): Promise<Board[]> {
    return this.pageAll<Board>("/rest/agile/1.0/board", {});
  }

  /** Follow startAt/isLast pagination for `values`-style Agile endpoints. */
  private async pageAll<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const items: T[] = [];
    for (;;) {
      const params = new URLSearchParams({ ...query, startAt: String(items.length), maxResults: "50" });
      const page = await this.http.get<Page<T>>(`${path}?${params}`);
      items.push(...page.values);
      if (page.isLast || page.values.length === 0) return items;
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

  sprints(boardId: number, state: string): Promise<Sprint[]> {
    return this.pageAll<Sprint>(`/rest/agile/1.0/board/${boardId}/sprint`, { state });
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
      hasMore = total === undefined ? page.issues.length === pageSize : issues.length < total;
    }
    // Without a total from Jira we can only report what we fetched; a full last page
    // may or may not mean more exist, so hasMore stays true only when total is known.
    if (total === undefined) hasMore = false;
    return { issues, total: total ?? issues.length, hasMore };
  }
}
