import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { SprintService } from "../../services/sprint.service.js";
import { sprintId } from "./common.js";

export function registerDelete(sprint: Command): void {
  sprint
    .command("delete <id>")
    .description("Delete a sprint; its tickets go back to the backlog (asks first; --yes skips the question)")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawId: string, opts: { yes?: boolean }, cmd: Command) => {
      const id = sprintId(rawId);
      const { mode } = bootstrap(cmd);
      const sprints = new SprintService();
      if (!opts.yes) {
        const found = await sprints.get(id);
        await confirm(
          `Delete sprint ${id} "${found.name}"? Its tickets go back to the backlog. This cannot be undone.`,
        );
      }
      await sprints.remove(id);
      printResult(mode, { id, deleted: true }, () => `Deleted sprint ${id}.`);
    });
}
