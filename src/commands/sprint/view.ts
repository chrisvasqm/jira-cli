import type { Command } from "commander";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { BoardService, onlyActive } from "../../services/board.service.js";
import { SprintService } from "../../services/sprint.service.js";
import { renderSprint, sprintContext, sprintId, sprintSummary, type BoardOptions } from "./common.js";

export function registerView(sprint: Command): void {
  sprint
    .command("view [id]")
    .description("Show a sprint (default: the board's active sprint)")
    .option("-b, --board <id>", "Board id (default: the configured board)")
    .action(async (rawId: string | undefined, opts: BoardOptions, cmd: Command) => {
      const id = rawId === undefined ? undefined : sprintId(rawId);
      const { boardId, mode } = sprintContext(opts, cmd);
      const found = id === undefined ? await activeSprint(boardId) : await new SprintService().get(id);
      const view = sprintSummary(found);
      printResult(mode, view, () => renderSprint(view));
    });
}

async function activeSprint(boardId: number) {
  const active = await new BoardService().sprints(boardId, "active");
  if (active === undefined) throw new CliError("NO_SPRINTS", `Board ${boardId} does not use sprints.`);
  const first = onlyActive(boardId, active);
  if (!first) throw new CliError("NO_ACTIVE_SPRINT", `Board ${boardId} has no active sprint.`);
  return first;
}
