import { CliError, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { ISSUE_LIST_FIELDS, type Issue } from "../core/jira-types.js";

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

export interface IssueList {
  issues: Issue[];
  total: number | null;
  hasMore: boolean | null;
}

interface IssuePage {
  issues: Issue[];
  total?: number;
}

interface BoardConfiguration {
  type: string;
  columnConfig: { columns: { name: string; statuses: { id: string }[] }[] };
}

function boardNotFound(boardId: number): (err: unknown) => never {
  return notFoundAs("BOARD_NOT_FOUND", `Board ${boardId} does not exist or you cannot see it.`);
}

/** Jira answers 400 "The board does not support sprints" for kanban and simple boards. */
function mentionsSprints(details: unknown): boolean {
  return /sprint/i.test(JSON.stringify(details ?? ""));
}

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

  get(boardId: number): Promise<Board> {
    return this.http.get<Board>(`/rest/agile/1.0/board/${boardId}`).catch(boardNotFound(boardId));
  }

  async configuration(boardId: number): Promise<BoardConfig> {
    const cfg = await this.http
      .get<BoardConfiguration>(`/rest/agile/1.0/board/${boardId}/configuration`)
      .catch(boardNotFound(boardId));
    return {
      type: cfg.type,
      columns: cfg.columnConfig.columns.map((col) => ({
        name: col.name,
        statusIds: col.statuses.map((status) => status.id),
      })),
    };
  }

  /** Sprints in the given state, or undefined when the board does not support sprints (Jira answers 400). */
  async sprints(boardId: number, state: string): Promise<Sprint[] | undefined> {
    try {
      return await this.pageAll<Sprint>(`/rest/agile/1.0/board/${boardId}/sprint`, { state });
    } catch (err) {
      if (err instanceof CliError && err.status === 400 && mentionsSprints(err.details)) return undefined;
      return boardNotFound(boardId)(err);
    }
  }

  /**
   * Issues matching the board filter, optionally narrowed by JQL, up to `limit`.
   * `total` and `hasMore` are null when Jira does not report a total.
   */
  async issues(boardId: number, jql: string | undefined, limit: number): Promise<IssueList> {
    const issues: Issue[] = [];
    let total: number | undefined;
    while (issues.length < limit) {
      const pageSize = Math.min(50, limit - issues.length);
      const params = new URLSearchParams({
        startAt: String(issues.length),
        maxResults: String(pageSize),
        fields: ISSUE_LIST_FIELDS,
      });
      if (jql) params.set("jql", jql);
      const page = await this.http
        .get<IssuePage>(`/rest/agile/1.0/board/${boardId}/issue?${params}`)
        .catch(boardNotFound(boardId));
      issues.push(...page.issues);
      total = page.total ?? total;
      if (page.issues.length === 0) break;
      // Jira may cap a page below maxResults; only a short page with no total means the end.
      if (total === undefined ? page.issues.length < pageSize : issues.length >= total) break;
    }
    return { issues, total: total ?? null, hasMore: total === undefined ? null : issues.length < total };
  }
}
