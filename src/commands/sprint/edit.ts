import type { Command } from "commander";
import { dateArg } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { SprintService, type SprintUpdate } from "../../services/sprint.service.js";
import { renderSprint, sprintId, sprintName, sprintView } from "./common.js";

interface EditOptions {
  name?: string;
  goal?: string;
  start?: string;
  end?: string;
}

export function registerEdit(sprint: Command): void {
  sprint
    .command("edit <id>")
    .description("Change a sprint's name, goal or dates; only the flags you pass change")
    .option("-N, --name <name>", "New name")
    .option("-g, --goal <text>", "New goal ('' clears it)")
    .option("-s, --start <date>", "Start, e.g. 2026-10-24")
    .option("-e, --end <date>", "End, e.g. 2026-11-07")
    .action(async (rawId: string, opts: EditOptions, cmd: Command) => {
      const id = sprintId(rawId);
      const update: SprintUpdate = {};
      if (opts.name !== undefined) update.name = sprintName(opts.name);
      if (opts.goal !== undefined) update.goal = opts.goal;
      if (opts.start !== undefined) update.startDate = dateArg(opts.start, "--start");
      if (opts.end !== undefined) update.endDate = dateArg(opts.end, "--end");
      if (Object.keys(update).length === 0) {
        throw new CliError("USAGE", "Nothing to change: pass --name, --goal, --start or --end");
      }
      const { mode } = bootstrap(cmd);
      const view = sprintView(await new SprintService().update(id, update));
      printResult(mode, view, () => `Updated sprint ${id}.\n${renderSprint(view)}`);
    });
}
