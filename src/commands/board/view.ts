import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { summarize, type Issue, type IssueSummary } from "../../core/jira-types.js";
import { printResult } from "../../core/output.js";
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

interface SprintScope {
  clause: string | undefined;
  note: string | undefined;
}

export function registerView(board: Command): void {
  board
    .command("view [id]", { isDefault: true })
    .description("Show a board's tickets grouped by column (default: the configured board)")
    .option(
      "--sprint <active|id|all>",
      "Sprint boards default to active sprints; 'all' lists every board issue",
    )
    .option("--status <name>", "Only issues in this column (or status) name")
    .option("--assignee <me|user>", "Only issues assigned to me, or to <user> (email, name or accountId)")
    .option("--jql <query>", "Extra JQL appended with AND")
    .option("--order-by <fields>", "JQL sort, e.g. 'updated DESC'")
    .option("--limit <n>", "Maximum issues to fetch", "100")
    .action(async (rawId: string | undefined, opts: BoardOptions, cmd: Command) => {
      const limit = validate(opts);
      const requested = rawId === undefined ? undefined : intInRange(rawId, "board id", 1);
      const { config, mode } = bootstrap(cmd);
      const boardId = requested ?? config.boardId;
      const boards = new BoardService();

      const needsActive = opts.sprint === undefined || opts.sprint === "active";
      const [boardConfig, active] = await Promise.all([
        boards.configuration(boardId),
        needsActive ? boards.sprints(boardId, "active") : Promise.resolve(undefined),
      ]);
      const scope = sprintScope(opts.sprint, active);
      const assignee = await assigneeClause(opts.assignee);
      const jql = buildJql(boardConfig, [scope.clause, assignee], opts);
      const result = await boards.issues(boardId, jql, limit);
      const columns = groupByColumn(boardConfig.columns, result.issues);

      printResult(
        mode,
        {
          boardId,
          boardType: boardConfig.type,
          jql: jql ?? null,
          note: scope.note ?? null,
          total: result.total,
          fetched: result.issues.length,
          hasMore: result.hasMore,
          columns,
        },
        // Without a total from Jira, a full page may mean more issues are left.
        () => {
          const more = result.hasMore ?? result.issues.length >= limit;
          return renderHuman(columns, result.total, result.issues.length, more, scope.note);
        },
      );
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

/** "me" stays currentUser(); names and emails resolve to an accountId, as in ticket edit. */
async function assigneeClause(who: string | undefined): Promise<string | undefined> {
  if (who === undefined) return undefined;
  if (who === "me") return "assignee = currentUser()";
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
  more: boolean,
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
  const of = total === null ? "" : ` of ${total}`;
  const footer = more ? `\n\nShowing ${fetched}${of}. Raise --limit to see more.` : "";
  return header + blocks.join("\n\n") + footer;
}
