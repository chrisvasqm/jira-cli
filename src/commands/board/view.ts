import type { Command } from "commander";
import { boardId, intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { summarize, type Issue, type IssueSummary } from "../../core/jira-types.js";
import { quote } from "../../core/jql.js";
import { printResult } from "../../core/output.js";
import { sameName } from "../../core/text.js";
import { BoardService, type BoardConfig, type Sprint } from "../../services/board.service.js";
import { UserService } from "../../services/user.service.js";

interface BoardOptions {
  sprint?: string;
  status?: string;
  assignee?: string;
  jql?: string;
  orderBy?: string;
  limit: string;
}

interface ColumnView {
  name: string;
  issues: IssueSummary[];
}

interface BoardView {
  boardId: number;
  boardType: string;
  jql: string | null;
  sprintIds: number[] | null;
  note: string | null;
  total: number | null;
  fetched: number;
  hasMore: boolean;
  columns: ColumnView[];
}

interface SprintScope {
  /** Sprints to read issues from; undefined means the whole board. */
  sprintIds: number[] | undefined;
  note: string | undefined;
}

export function registerView(board: Command): void {
  board
    .command("view [id]", { isDefault: true })
    .description("Show a board's tickets grouped by column (default: the configured board)")
    .option(
      "-S, --sprint <active|id|all>",
      "Sprint boards default to active sprints; 'all' lists every board issue",
    )
    .option("-s, --status <name>", "Only issues in this column (or status) name")
    .option(
      "-a, --assignee <me|user>",
      "Only issues assigned to me, none (unassigned), or <user> (email, name or accountId)",
    )
    .option("-q, --jql <query>", "Extra JQL appended with AND")
    .option("-o, --order-by <fields>", "JQL sort, e.g. 'updated DESC'")
    .option("-n, --limit <n>", "Maximum issues to fetch", "100")
    .action(async (rawId: string | undefined, opts: BoardOptions, cmd: Command) => {
      const limit = validate(opts);
      const requested = rawId === undefined ? undefined : boardId(rawId);
      const { config, mode } = bootstrap(cmd);
      const id = requested ?? config.boardId;
      const boards = new BoardService();

      const needsActive = opts.sprint === undefined || opts.sprint === "active";
      const [boardConfig, active, assignee] = await Promise.all([
        boards.configuration(id),
        needsActive ? boards.sprints(id, "active") : Promise.resolve(undefined),
        assigneeClause(opts.assignee),
      ]);
      const scope = sprintScope(opts.sprint, active);
      const jql = buildJql(boardConfig, [assignee], opts);
      const result = await boards.issues(id, { jql, limit, sprintIds: scope.sprintIds });
      const view: BoardView = {
        boardId: id,
        boardType: boardConfig.type,
        jql: jql ?? null,
        sprintIds: scope.sprintIds ?? null,
        note: scope.note ?? null,
        total: result.total,
        fetched: result.issues.length,
        hasMore: result.hasMore,
        columns: groupByColumn(boardConfig.columns, result.issues),
      };
      printResult(mode, view, () => renderHuman(view));
    });
}

/** Checks the flags and returns --limit as a number. */
function validate(opts: BoardOptions): number {
  const limit = intInRange(opts.limit, "--limit", 1);
  if (opts.sprint !== undefined && !["active", "all"].includes(opts.sprint) && !/^\d+$/.test(opts.sprint)) {
    throw new CliError("USAGE", "--sprint takes 'active', 'all' or a numeric sprint id");
  }
  return limit;
}

/** `active` is undefined when the board has no sprint support; only fetched when needed. */
function sprintScope(option: string | undefined, active: Sprint[] | undefined): SprintScope {
  const none: SprintScope = { sprintIds: undefined, note: undefined };
  if (option === "all") return none;
  if (option !== undefined && option !== "active") return { sprintIds: [Number(option)], note: undefined };
  if (active === undefined) {
    if (option === "active") throw new CliError("NO_SPRINTS", "This board does not use sprints.");
    return none;
  }
  if (active.length === 0) {
    if (option === "active") throw new CliError("NO_ACTIVE_SPRINT", "This board has no active sprint.");
    return { sprintIds: undefined, note: "No active sprint; showing every issue on the board." };
  }
  return { sprintIds: active.map((sprint) => sprint.id), note: undefined };
}

/** "me" stays currentUser() and "none" means unassigned; names and emails resolve to an accountId, as in ticket edit. */
async function assigneeClause(who: string | undefined): Promise<string | undefined> {
  if (who === undefined) return undefined;
  if (who === "me") return "assignee = currentUser()";
  if (who === "none") return "assignee is EMPTY";
  const user = await new UserService().resolve(who);
  return `assignee = ${quote(user.accountId)}`;
}

function buildJql(
  boardConfig: BoardConfig,
  extra: (string | undefined)[],
  opts: BoardOptions,
): string | undefined {
  const clauses = extra.filter((clause) => clause !== undefined);
  if (opts.status) clauses.push(statusJql(boardConfig, opts.status));
  if (opts.jql) clauses.push(`(${opts.jql})`);

  const orderBy = opts.orderBy ? `ORDER BY ${opts.orderBy}` : "";
  const jql = `${clauses.join(" AND ")} ${orderBy}`.trim();
  return jql || undefined;
}

function statusJql(boardConfig: BoardConfig, name: string): string {
  const column = boardConfig.columns.find((col) => sameName(col.name, name));
  if (column && column.statusIds.length > 0) return `status in (${column.statusIds.join(", ")})`;
  return `status = ${quote(name)}`;
}

/** Every configured column is kept (possibly empty) so consumers see the board's shape. */
function groupByColumn(columns: BoardConfig["columns"], issues: Issue[]): ColumnView[] {
  const views: ColumnView[] = columns.map((col) => ({ name: col.name, issues: [] }));
  const other: ColumnView = { name: "(no column)", issues: [] };
  const byStatus = new Map<string, ColumnView>();
  columns.forEach((col, index) => {
    for (const id of col.statusIds) byStatus.set(id, views[index]!);
  });
  for (const issue of issues) {
    (byStatus.get(issue.fields.status.id) ?? other).issues.push(summarize(issue));
  }
  if (other.issues.length > 0) views.push(other);
  return views;
}

function renderHuman({ columns, total, fetched, hasMore, note }: BoardView): string {
  const header = note ? `note: ${note}\n\n` : "";
  if (fetched === 0) return `${header}No issues match.`;
  const shown = columns.filter((col) => col.issues.length > 0);
  const keyWidth = Math.max(...shown.flatMap((col) => col.issues.map((issue) => issue.key.length)));
  const blocks = shown.map((col) => {
    const lines = col.issues.map((issue) => {
      const who = issue.assignee ?? "unassigned";
      return `  ${issue.key.padEnd(keyWidth)}  ${issue.summary}  [${issue.type}, ${who}]`;
    });
    return [`${col.name} (${col.issues.length})`, ...lines].join("\n");
  });
  const of = total === null ? "" : ` of ${total}`;
  const footer = hasMore ? `\n\nShowing ${fetched}${of}. Raise --limit to see more.` : "";
  return header + blocks.join("\n\n") + footer;
}
