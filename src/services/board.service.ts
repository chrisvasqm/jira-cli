import { CliError, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages } from "../core/paging.js";
import { ISSUE_LIST_FIELDS, type Issue } from "../core/jira-types.js";

export interface Board {
  id: number;
  name: string;
  type: string;
  location?: { projectKey?: string; projectName?: string };
}

interface BoardColumn {
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

interface ValuesPage<T> {
  values: T[];
  isLast: boolean;
}

interface IssueList {
  issues: Issue[];
  total: number | null;
  hasMore: boolean;
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

  /** Every item of a `values`-style Agile endpoint. */
  private async pageAll<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const { items } = await collectPages<T>(
      async (startAt, maxResults) => {
        const params = new URLSearchParams({
          ...query,
          startAt: String(startAt),
          maxResults: String(maxResults),
        });
        const page = await this.http.get<ValuesPage<T>>(`${path}?${params}`);
        return { items: page.values, isLast: page.isLast };
      },
      Number.POSITIVE_INFINITY,
      50,
    );
    return items;
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
   * With `sprintIds`, only those sprints' issues, read from the sprint endpoint
   * (a `sprint in (...)` JQL clause fails on projects that have no Sprint field).
   */
  async issues(
    boardId: number,
    jql: string | undefined,
    limit: number,
    sprintIds?: number[],
  ): Promise<IssueList> {
    if (!sprintIds)
      return this.fetchIssues(`/rest/agile/1.0/board/${boardId}/issue`, jql, limit, boardNotFound(boardId));
    const issues: Issue[] = [];
    let total: number | null = 0;
    let hasMore = false;
    for (const [index, sprintId] of sprintIds.entries()) {
      const notFound = notFoundAs("SPRINT_NOT_FOUND", `Sprint ${sprintId} is not on board ${boardId}.`);
      const path = `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue`;
      const page = await this.fetchIssues(path, jql, limit - issues.length, notFound);
      issues.push(...page.issues);
      total = total === null || page.total === null ? null : total + page.total;
      hasMore ||= page.hasMore;
      if (issues.length >= limit) {
        hasMore ||= index < sprintIds.length - 1;
        break;
      }
    }
    return { issues, total, hasMore };
  }

  private async fetchIssues(
    path: string,
    jql: string | undefined,
    limit: number,
    onError: (err: unknown) => never,
  ): Promise<IssueList> {
    const result = await collectPages<Issue>(
      async (startAt, maxResults) => {
        const params = new URLSearchParams({
          startAt: String(startAt),
          maxResults: String(maxResults),
          fields: ISSUE_LIST_FIELDS,
        });
        if (jql) params.set("jql", jql);
        const page = await this.http.get<IssuePage>(`${path}?${params}`).catch(onError);
        return { items: page.issues, total: page.total };
      },
      limit,
      // Jira caps the page size itself; asking for more saves round trips where it allows it.
      1000,
    );
    return { issues: result.items, total: result.total, hasMore: result.hasMore };
  }
}
