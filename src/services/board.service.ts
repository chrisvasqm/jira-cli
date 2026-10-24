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
  /** Saved filter that defines the board's tickets. */
  filterId: string | null;
  /** Field the board estimates with (story points), when it has one. */
  estimation: { fieldId: string; name: string } | null;
}

export interface Sprint {
  id: number;
  name: string;
  state: "future" | "active" | "closed";
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

interface IssueQuery {
  jql?: string | undefined;
  limit: number;
  /** Only these sprints' issues, read from the sprint endpoint. */
  sprintIds?: number[] | undefined;
  /** Fields to fetch besides ISSUE_LIST_FIELDS. */
  extraFields?: string[];
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
  filter?: { id: string };
  estimation?: { type: string; field?: { fieldId: string; displayName: string } };
}

export function boardNotFound(boardId: number): (err: unknown) => never {
  return notFoundAs("BOARD_NOT_FOUND", `Board ${boardId} does not exist or you cannot see it.`);
}

/** Jira answers 400 "The board does not support sprints" for kanban and simple boards. */
function mentionsSprints(details: unknown): boolean {
  return /sprint/i.test(JSON.stringify(details ?? ""));
}

/**
 * The one active sprint in `active`. Boards with parallel sprints can have several: then
 * `SPRINT_AMBIGUOUS` lists them, as `--sprint active` does, instead of picking one silently.
 */
export function onlyActive(boardId: number, active: Sprint[]): Sprint | undefined {
  if (active.length <= 1) return active[0];
  throw new CliError(
    "SPRINT_AMBIGUOUS",
    `Board ${boardId} has ${active.length} active sprints; pass a sprint id.`,
    active.map((sprint) => ({ id: sprint.id, name: sprint.name, state: sprint.state })),
  );
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
      filterId: cfg.filter?.id ?? null,
      estimation:
        cfg.estimation?.type === "field" && cfg.estimation.field
          ? { fieldId: cfg.estimation.field.fieldId, name: cfg.estimation.field.displayName }
          : null,
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
  async issues(boardId: number, query: IssueQuery): Promise<IssueList> {
    const fields = [ISSUE_LIST_FIELDS, ...(query.extraFields ?? [])].join(",");
    const { jql, limit, sprintIds } = query;
    if (!sprintIds) {
      return this.fetchIssues(
        `/rest/agile/1.0/board/${boardId}/issue`,
        { jql, limit, fields },
        boardNotFound(boardId),
      );
    }
    const issues: Issue[] = [];
    let total: number | null = 0;
    let hasMore = false;
    for (const [index, sprintId] of sprintIds.entries()) {
      const notFound = notFoundAs("SPRINT_NOT_FOUND", `Sprint ${sprintId} is not on board ${boardId}.`);
      const path = `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue`;
      const page = await this.fetchIssues(path, { jql, limit: limit - issues.length, fields }, notFound);
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
    query: { jql: string | undefined; limit: number; fields: string },
    onError: (err: unknown) => never,
  ): Promise<IssueList> {
    const result = await collectPages<Issue>(
      async (startAt, maxResults) => {
        const params = new URLSearchParams({
          startAt: String(startAt),
          maxResults: String(maxResults),
          fields: query.fields,
        });
        if (query.jql) params.set("jql", query.jql);
        const page = await this.http.get<IssuePage>(`${path}?${params}`).catch(onError);
        return { items: page.issues, total: page.total };
      },
      query.limit,
      // Jira caps the page size itself; asking for more saves round trips where it allows it.
      1000,
    );
    return { issues: result.items, total: result.total, hasMore: result.hasMore };
  }
}
