import type { Command } from "commander";
import { boardId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import type { OutputMode } from "../../core/output.js";
import { BoardService, type BoardConfig, type Sprint } from "../../services/board.service.js";
import { localTime } from "../render.js";

export interface BoardContext {
  boardId: number;
  board: BoardConfig;
  boards: BoardService;
  mode: OutputMode;
}

export interface ReportOptions {
  board?: string;
}

/** `--board <id>` or the configured board, with its configuration. */
export async function reportContext(opts: ReportOptions, cmd: Command): Promise<BoardContext> {
  const requested = opts.board === undefined ? undefined : boardId(opts.board);
  const { config, mode } = bootstrap(cmd);
  const id = requested ?? config.boardId;
  const boards = new BoardService();
  return { boardId: id, board: await boards.configuration(id), boards, mode };
}

/** JQL that selects the board's tickets, so search can add conditions to it. */
export function boardJql(ctx: BoardContext): string {
  if (!ctx.board.filterId)
    throw new CliError("JIRA_ERROR", `Board ${ctx.boardId} has no saved filter to search.`);
  return `filter = ${ctx.board.filterId}`;
}

/** Sprints in `state`; a board without sprints is an error for the sprint reports. */
export async function boardSprints(ctx: BoardContext, state: string): Promise<Sprint[]> {
  const sprints = await ctx.boards.sprints(ctx.boardId, state);
  if (sprints === undefined) {
    throw new CliError(
      "NO_SPRINTS",
      `Board ${ctx.boardId} does not use sprints, so it has no sprint reports.`,
    );
  }
  return sprints;
}

export function person(name: string | null | undefined): string {
  return name ?? "Unassigned";
}

/** Local calendar date (YYYY-MM-DD) of a timestamp; "?" when missing. */
export function localDate(iso: string | null | undefined): string {
  return iso ? localTime(iso).slice(0, 10) : "?";
}

/** "1 ticket", "2 tickets". */
export function plural(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}
