import type { Command } from "commander";
import { bootstrap } from "../core/bootstrap.js";
import { CliError } from "../core/errors.js";
import { summarize, type Issue, type IssueSummary } from "../core/jira-types.js";
import { printResult } from "../core/output.js";
import { BoardService, type BoardConfig } from "../services/board.service.js";

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

export function registerBoard(program: Command): void {
  program
    .command("board")
    .description("List the tickets on the configured board, grouped by column")
    .option(
      "--sprint <active|id|all>",
      "Scrum boards default to active sprints; 'all' lists every board issue",
    )
    .option("--status <name>", "Only issues in this column (or status) name")
    .option("--assignee <me|user>", "Only issues assigned to me, or to <user> (email or accountId)")
    .option("--jql <query>", "Extra JQL appended with AND (no ORDER BY; use --order-by)")
    .option("--order-by <fields>", "JQL sort, e.g. 'updated DESC'")
    .option("--limit <n>", "Maximum issues to fetch", "100")
    .action(async (opts: BoardOptions, cmd: Command) => {
      if (!/^\d+$/.test(opts.limit) || Number(opts.limit) < 1) {
        throw new CliError("USAGE", "--limit must be a positive integer");
      }
      if (opts.jql && /\border\s+by\b/i.test(opts.jql)) {
        throw new CliError("USAGE", "Put ORDER BY in --order-by, not --jql");
      }
      const limit = Number(opts.limit);
      const { config, mode } = bootstrap(cmd);

      const boards = new BoardService();
      const boardConfig = await boards.configuration(config.boardId);
      const { jql, note } = await buildJql(boards, config.boardId, boardConfig, opts);
      const result = await boards.issues(config.boardId, jql, limit);
      const grouped = groupByColumn(boardConfig.columns, result.issues);

      printResult(
        mode,
        {
          boardId: config.boardId,
          boardType: boardConfig.type,
          jql: jql ?? null,
          note: note ?? null,
          total: result.total,
          fetched: result.issues.length,
          hasMore: result.hasMore,
          columns: grouped,
        },
        () => renderHuman(grouped, result.total, result.issues.length, result.hasMore, note),
      );
    });
}

interface Query {
  jql: string | undefined;
  /** Human-facing caveat about how the query was built. */
  note: string | undefined;
}

async function buildJql(
  boards: BoardService,
  boardId: number,
  boardConfig: BoardConfig,
  opts: BoardOptions,
): Promise<Query> {
  const clauses: string[] = [];
  const sprint = await sprintJql(boards, boardId, boardConfig, opts.sprint);
  if (sprint.clause) clauses.push(sprint.clause);
  if (opts.status) clauses.push(statusJql(boardConfig, opts.status));
  if (opts.assignee === "me") clauses.push("assignee = currentUser()");
  else if (opts.assignee) clauses.push(`assignee = ${quote(opts.assignee)}`);
  if (opts.jql) clauses.push(`(${opts.jql})`);

  const where = clauses.join(" AND ");
  const orderBy = opts.orderBy ? `ORDER BY ${opts.orderBy}` : "";
  const jql = `${where} ${orderBy}`.trim();
  return { jql: jql || undefined, note: sprint.note };
}

async function sprintJql(
  boards: BoardService,
  boardId: number,
  boardConfig: BoardConfig,
  option: string | undefined,
): Promise<{ clause: string | undefined; note: string | undefined }> {
  const none = { clause: undefined, note: undefined };
  const isScrum = boardConfig.type === "scrum";
  if (option === "all") return none;
  if (option === undefined && !isScrum) return none;
  if (option !== undefined && option !== "active") {
    if (!/^\d+$/.test(option))
      throw new CliError("USAGE", "--sprint takes 'active', 'all' or a numeric sprint id");
    return { clause: `sprint = ${option}`, note: undefined };
  }
  if (!isScrum) throw new CliError("NO_SPRINTS", `This ${boardConfig.type} board has no sprints.`);
  const active = await boards.sprints(boardId, "active");
  if (active.length === 0) {
    if (option === "active") throw new CliError("NO_ACTIVE_SPRINT", "This board has no active sprint.");
    return { clause: undefined, note: "No active sprint; showing every issue on the board." };
  }
  return { clause: `sprint in (${active.map((sprint) => sprint.id).join(", ")})`, note: undefined };
}

function statusJql(boardConfig: BoardConfig, name: string): string {
  const column = boardConfig.columns.find((col) => col.name.toLowerCase() === name.toLowerCase());
  if (column && column.statusIds.length > 0) return `status in (${column.statusIds.join(", ")})`;
  return `status = ${quote(name)}`;
}

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

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
  return views.filter((view) => view.issues.length > 0);
}

function renderHuman(
  columns: ColumnView[],
  total: number,
  fetched: number,
  hasMore: boolean,
  note: string | undefined,
): string {
  const header = note ? `note: ${note}\n\n` : "";
  if (fetched === 0) return `${header}No issues match.`;
  const keyWidth = Math.max(...columns.flatMap((col) => col.issues.map((issue) => issue.key.length)));
  const blocks = columns.map((col) => {
    const lines = col.issues.map((issue) => {
      const who = issue.assignee ?? "unassigned";
      return `  ${issue.key.padEnd(keyWidth)}  ${issue.summary}  [${issue.type}, ${who}]`;
    });
    return [`${col.name} (${col.issues.length})`, ...lines].join("\n");
  });
  const more = hasMore ? `\n\nShowing ${fetched} of ${total}. Raise --limit to see more.` : "";
  return header + blocks.join("\n\n") + more;
}
