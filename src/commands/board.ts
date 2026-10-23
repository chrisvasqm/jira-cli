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
    .option("--assignee <me|name>", "Only issues assigned to me, or to <name>")
    .option("--jql <query>", "Extra JQL appended with AND; may end with ORDER BY")
    .option("--limit <n>", "Maximum issues to fetch", "100")
    .action(async (opts: BoardOptions, cmd: Command) => {
      const { config, mode } = bootstrap(cmd);
      if (!/^\d+$/.test(opts.limit) || Number(opts.limit) < 1) {
        throw new CliError("USAGE", "--limit must be a positive integer");
      }
      const limit = Number(opts.limit);

      const boards = new BoardService();
      const boardConfig = await boards.configuration(config.boardId);
      const jql = await buildJql(boards, config.boardId, boardConfig, opts);
      const result = await boards.issues(config.boardId, jql, limit);
      const grouped = groupByColumn(boardConfig.columns, result.issues);

      printResult(
        mode,
        {
          boardId: config.boardId,
          boardType: boardConfig.type,
          jql: jql ?? null,
          total: result.total,
          fetched: result.issues.length,
          hasMore: result.hasMore,
          columns: grouped,
        },
        () => renderHuman(grouped, result.total, result.issues.length, result.hasMore),
      );
    });
}

async function buildJql(
  boards: BoardService,
  boardId: number,
  boardConfig: BoardConfig,
  opts: BoardOptions,
): Promise<string | undefined> {
  const clauses: string[] = [];
  const sprintClause = await sprintJql(boards, boardId, boardConfig, opts.sprint);
  if (sprintClause) clauses.push(sprintClause);
  if (opts.status) clauses.push(statusJql(boardConfig, opts.status));
  if (opts.assignee === "me") clauses.push("assignee = currentUser()");
  else if (opts.assignee) clauses.push(`assignee = ${quote(opts.assignee)}`);

  const { where, orderBy } = splitOrderBy(opts.jql);
  if (where) clauses.push(`(${where})`);
  const query = clauses.join(" AND ");
  if (!query && !orderBy) return undefined;
  return `${query}${orderBy ? ` ${orderBy}` : ""}`.trim();
}

async function sprintJql(
  boards: BoardService,
  boardId: number,
  boardConfig: BoardConfig,
  option: string | undefined,
): Promise<string | undefined> {
  const isScrum = boardConfig.type === "scrum";
  if (option === "all") return undefined;
  if (option === undefined && !isScrum) return undefined;
  if (option !== undefined && option !== "active") {
    if (!/^\d+$/.test(option))
      throw new CliError("USAGE", "--sprint takes 'active', 'all' or a numeric sprint id");
    return `sprint = ${option}`;
  }
  if (!isScrum) throw new CliError("NO_SPRINTS", `This ${boardConfig.type} board has no sprints.`);
  const active = await boards.sprints(boardId, "active");
  if (active.length === 0) {
    if (option === undefined) return undefined;
    throw new CliError("NO_ACTIVE_SPRINT", "This board has no active sprint.");
  }
  return `sprint in (${active.map((sprint) => sprint.id).join(", ")})`;
}

function statusJql(boardConfig: BoardConfig, name: string): string {
  const column = boardConfig.columns.find((col) => col.name.toLowerCase() === name.toLowerCase());
  if (column && column.statusIds.length > 0) return `status in (${column.statusIds.join(", ")})`;
  return `status = ${quote(name)}`;
}

function splitOrderBy(jql: string | undefined): { where: string | undefined; orderBy: string | undefined } {
  if (!jql) return { where: undefined, orderBy: undefined };
  const match = /\border\s+by\b/i.exec(jql);
  if (!match) return { where: jql.trim() || undefined, orderBy: undefined };
  return { where: jql.slice(0, match.index).trim() || undefined, orderBy: jql.slice(match.index).trim() };
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

function renderHuman(columns: ColumnView[], total: number, fetched: number, hasMore: boolean): string {
  if (fetched === 0) return "No issues match.";
  const keyWidth = Math.max(...columns.flatMap((col) => col.issues.map((issue) => issue.key.length)));
  const blocks = columns.map((col) => {
    const lines = col.issues.map((issue) => {
      const who = issue.assignee ?? "unassigned";
      return `  ${issue.key.padEnd(keyWidth)}  ${issue.summary}  [${issue.type}, ${who}]`;
    });
    return [`${col.name} (${col.issues.length})`, ...lines].join("\n");
  });
  const note = hasMore ? `\n\nShowing ${fetched} of ${total}. Raise --limit to see more.` : "";
  return blocks.join("\n\n") + note;
}
