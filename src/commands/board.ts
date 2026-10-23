import type { Command } from "commander";
import { bootstrap } from "../core/bootstrap.js";
import { CliError } from "../core/errors.js";
import { summarize, type IssueSummary } from "../core/jira-types.js";
import { printResult } from "../core/output.js";
import { BoardService, type BoardColumn } from "../services/board.service.js";

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
    .option("--sprint <active|id>", "Only issues in the active sprint, or in sprint <id>")
    .option("--status <name>", "Only issues in this status (column)")
    .option("--assignee <me|name>", "Only issues assigned to me, or to <name>")
    .option("--jql <query>", "Extra JQL appended with AND")
    .option("--limit <n>", "Maximum issues to fetch", "100")
    .action(async (opts: BoardOptions, cmd: Command) => {
      const { config, mode } = bootstrap(cmd);
      const limit = Number(opts.limit);
      if (!Number.isInteger(limit) || limit < 1)
        throw new CliError("USAGE", "--limit must be a positive integer");

      const boards = new BoardService();
      const jql = await buildJql(boards, config.boardId, opts);
      const [columns, result] = await Promise.all([
        boards.columns(config.boardId),
        boards.issues(config.boardId, jql, limit),
      ]);
      const summaries = result.issues.map(summarize);
      const grouped = groupByColumn(
        columns,
        result.issues.map((issue) => issue.fields.status.id),
        summaries,
      );

      printResult(
        mode,
        {
          boardId: config.boardId,
          total: result.total,
          fetched: summaries.length,
          jql: jql ?? null,
          columns: grouped,
        },
        () => renderHuman(grouped, result.total, summaries.length),
      );
    });
}

async function buildJql(
  boards: BoardService,
  boardId: number,
  opts: BoardOptions,
): Promise<string | undefined> {
  const clauses: string[] = [];
  if (opts.sprint === "active") {
    const [sprint] = await boards.sprints(boardId, "active");
    if (!sprint) throw new CliError("NO_ACTIVE_SPRINT", "This board has no active sprint.");
    clauses.push(`sprint = ${sprint.id}`);
  } else if (opts.sprint) {
    if (!/^\d+$/.test(opts.sprint))
      throw new CliError("USAGE", "--sprint takes 'active' or a numeric sprint id");
    clauses.push(`sprint = ${opts.sprint}`);
  }
  if (opts.status) clauses.push(`status = ${quote(opts.status)}`);
  if (opts.assignee === "me") clauses.push("assignee = currentUser()");
  else if (opts.assignee) clauses.push(`assignee = ${quote(opts.assignee)}`);
  if (opts.jql) clauses.push(`(${opts.jql})`);
  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function groupByColumn(columns: BoardColumn[], statusIds: string[], issues: IssueSummary[]): ColumnView[] {
  const views: ColumnView[] = columns.map((col) => ({ name: col.name, issues: [] }));
  const other: ColumnView = { name: "(no column)", issues: [] };
  const byStatus = new Map<string, ColumnView>();
  columns.forEach((col, index) => {
    for (const id of col.statusIds) byStatus.set(id, views[index]!);
  });
  issues.forEach((issue, index) => {
    (byStatus.get(statusIds[index]!) ?? other).issues.push(issue);
  });
  if (other.issues.length > 0) views.push(other);
  return views.filter((view) => view.issues.length > 0);
}

function renderHuman(columns: ColumnView[], total: number, fetched: number): string {
  if (fetched === 0) return "No issues match.";
  const keyWidth = Math.max(...columns.flatMap((col) => col.issues.map((issue) => issue.key.length)));
  const blocks = columns.map((col) => {
    const lines = col.issues.map((issue) => {
      const who = issue.assignee ?? "unassigned";
      return `  ${issue.key.padEnd(keyWidth)}  ${issue.summary}  [${issue.type}, ${who}]`;
    });
    return [`${col.name} (${col.issues.length})`, ...lines].join("\n");
  });
  const note = fetched < total ? `\n\nShowing ${fetched} of ${total}. Raise --limit to see more.` : "";
  return blocks.join("\n\n") + note;
}
