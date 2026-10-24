import type { Command } from "commander";
import { boardId, intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import type { OutputMode } from "../../core/output.js";
import { table } from "../../core/output.js";
import type { Sprint } from "../../services/board.service.js";
import { SprintService } from "../../services/sprint.service.js";
import { sprintSummary } from "../report/sprint-stats.js";

export { sprintSummary };
import { localTime } from "../render.js";

export interface BoardOptions {
  board?: string;
}

/** `--board <id>` or the configured board. */
export function sprintContext(opts: BoardOptions, cmd: Command): { boardId: number; mode: OutputMode } {
  const requested = opts.board === undefined ? undefined : boardId(opts.board);
  const { config, mode } = bootstrap(cmd);
  return { boardId: requested ?? config.boardId, mode };
}

/** Jira refuses sprint names longer than 30 characters. */
const MAX_NAME = 30;

export function sprintName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new CliError("USAGE", "--name cannot be empty");
  if (name.length > MAX_NAME) {
    throw new CliError(
      "USAGE",
      `--name holds at most ${MAX_NAME} characters (Jira's limit); got ${name.length}`,
    );
  }
  return name;
}

export const sprintId = (raw: string): number => intInRange(raw, "sprint id", 1);

/** The sprint, which must be in `state` for the change Jira is asked to make. */
export async function sprintIn(id: number, state: Sprint["state"], action: string): Promise<Sprint> {
  const sprint = await new SprintService().get(id);
  if (sprint.state !== state) {
    const code = state === "future" ? "SPRINT_NOT_FUTURE" : "SPRINT_NOT_ACTIVE";
    throw new CliError(
      code,
      `Sprint ${id} is ${sprint.state}; only ${state === "active" ? "an" : "a"} ${state} sprint can ${action}.`,
    );
  }
  return sprint;
}

const when = (iso: string | null): string => (iso ? localTime(iso) : "-");

export function renderSprint(sprint: ReturnType<typeof sprintSummary>): string {
  return table([
    ["Sprint", `${sprint.id}  ${sprint.name}`],
    ["State", sprint.state],
    ["Goal", sprint.goal || "-"],
    ["Start", when(sprint.startDate)],
    ["End", when(sprint.endDate)],
    ...(sprint.completeDate ? [["Closed", when(sprint.completeDate)] as const] : []),
  ]);
}
