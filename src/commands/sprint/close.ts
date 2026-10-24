import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { SprintService } from "../../services/sprint.service.js";
import { renderSprint, sprintId, sprintIn, sprintSummary } from "./common.js";

export function registerClose(sprint: Command): void {
  sprint
    .command("close <id>")
    .description("Close (complete) the active sprint (asks first; --yes skips the question)")
    .option("-y, --yes", "Close without asking")
    .action(async (rawId: string, opts: { yes?: boolean }, cmd: Command) => {
      const id = sprintId(rawId);
      const { mode } = bootstrap(cmd);
      const found = await sprintIn(id, "active", "close");
      if (!opts.yes)
        await confirm(`Close sprint ${id} "${found.name}"? Its unfinished tickets go back to the backlog.`);
      const view = sprintSummary(await new SprintService().update(id, { state: "closed" }));
      printResult(mode, view, () => `Closed sprint ${id}.\n${renderSprint(view)}`);
    });
}
