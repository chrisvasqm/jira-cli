import type { Command } from "commander";
import { intInRange } from "../core/args.js";
import { bootstrap } from "../core/bootstrap.js";
import { CliError } from "../core/errors.js";
import { summarize, type Issue, type IssueSummary } from "../core/jira-types.js";
import { printResult } from "../core/output.js";
import { BoardService, type BoardConfig, type Sprint } from "../services/board.service.js";

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

interface SprintScope {
  clause: string | undefined;
  note: string | undefined;
}

export function registerBoard(program: Command): void {
  program
    .command("board")
    .description("List the tickets on the configured board, grouped by column")
    .option(
      "--sprint <active|id|all>",
      "Sprint boards default to active sprints; 'all' lists every board issue",
    )
    .option("--status <name>", "Only issues in this column (or status) name")
    .option("--assignee <me|user>", "Only issues assigned to me, or to <user> (email or accountId)")
    .option("--jql <query>", "Extra JQL appended with AND")
    .option("--order-by <fields>", "JQL sort, e.g. 'updated DESC'")
    .option("--limit <n>", "Maximum issues to fetch", "100")
    .action(async (opts: BoardOptions, cmd: Command) => {
      validate(opts);
      const limit = Number(opts.limit);
      const { config, mode } = bootstrap(cmd);
      const boards = new BoardService();

      const needsActive = opts.sprint === undefined || opts.sprint === "active";
      const [boardConfig, active] = await Promise.all([
        boards.configuration(config.boardId),
        needsActive ? boards.sprints(config.boardId, "active") : Promise.resolve(undefined),
      ]);
      const scope = sprintScope(opts.sprint, active);
      const jql = buildJql(boardConfig, scope.clause, opts);
      const result = await boards.issues(config.boardId, jql, limit);
      const columns = groupByColumn(boardConfig.columns, result.issues);

      printResult(
        mode,
        {
          boardId: config.boardId,
          boardType: boardConfig.type,
          jql: jql ?? null,
          note: scope.note ?? null,
          total: result.total,
          fetched: result.issues.length,
          hasMore: result.hasMore,
          columns,
        },
        () => renderHuman(columns, result.total, result.issues.length, result.hasMore, scope.note),
      );
    });
}

function validate(opts: BoardOptions): void {
  intInRange(opts.limit, "--limit", 1, 10_000);
  if (opts.sprint !== undefined && !["active", "all"].includes(opts.sprint) && !/^\d+$/.test(opts.sprint)) {
    throw new CliError("USAGE", "--sprint takes 'active', 'all' or a numeric sprint id");
  }
}

/** `active` is undefined when the board has no sprint support; only fetched when needed. */
function sprintScope(option: string | undefined, active: Sprint[] | undefined): SprintScope {
  const none: SprintScope = { clause: undefined, note: undefined };
  if (option === "all") return none;
  if (option !== undefined && option !== "active") return { clause: `sprint = ${option}`, note: undefined };
  if (active === undefined) {
    if (option === "active") throw new CliError("NO_SPRINTS", "This board does not use sprints.");
    return none;
  }
  if (active.length === 0) {
    if (option === "active") throw new CliError("NO_ACTIVE_SPRINT", "This board has no active sprint.");
    return { clause: undefined, note: "No active sprint; showing every issue on the board." };
  }
  return { clause: `sprint in (${active.map((sprint) => sprint.id).join(", ")})`, note: undefined };
}

function buildJql(
  boardConfig: BoardConfig,
  sprintClause: string | undefined,
  opts: BoardOptions,
): string | undefined {
  const clauses: string[] = [];
  if (sprintClause) clauses.push(sprintClause);
  if (opts.status) clauses.push(statusJql(boardConfig, opts.status));
  if (opts.assignee === "me") clauses.push("assignee = currentUser()");
  else if (opts.assignee) clauses.push(`assignee = ${quote(opts.assignee)}`);
  if (opts.jql) clauses.push(`(${opts.jql})`);

  const orderBy = opts.orderBy ? `ORDER BY ${opts.orderBy}` : "";
  const jql = `${clauses.join(" AND ")} ${orderBy}`.trim();
  return jql || undefined;
}

function statusJql(boardConfig: BoardConfig, name: string): string {
  const column = boardConfig.columns.find((col) => col.name.toLowerCase() === name.toLowerCase());
  if (column && column.statusIds.length > 0) return `status in (${column.statusIds.join(", ")})`;
  return `status = ${quote(name)}`;
}

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
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

function renderHuman(
  columns: ColumnView[],
  total: number | null,
  fetched: number,
  hasMore: boolean | null,
  note: string | undefined,
): string {
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
  const more = hasMore ? `\n\nShowing ${fetched} of ${total}. Raise --limit to see more.` : "";
  return header + blocks.join("\n\n") + more;
}
