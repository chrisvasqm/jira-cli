import type { Command } from "commander";
import { assertDateOrder, dateArg } from "../../core/args.js";
import { printResult } from "../../core/output.js";
import { SprintService } from "../../services/sprint.service.js";
import { renderSprint, sprintContext, sprintName, sprintSummary, type BoardOptions } from "./common.js";

interface CreateOptions extends BoardOptions {
  name: string;
  goal?: string;
  start?: string;
  end?: string;
}

export function registerCreate(sprint: Command): void {
  sprint
    .command("create")
    .description("Create a future sprint on a board")
    .requiredOption("-N, --name <name>", "Sprint name")
    .option("-g, --goal <text>", "Sprint goal")
    .option("-s, --start <date>", "Planned start, e.g. 2026-10-24")
    .option("-e, --end <date>", "Planned end, e.g. 2026-11-07")
    .option("-b, --board <id>", "Board id (default: the configured board)")
    .action(async (opts: CreateOptions, cmd: Command) => {
      const name = sprintName(opts.name);
      const startDate = opts.start === undefined ? undefined : dateArg(opts.start, "--start");
      const endDate = opts.end === undefined ? undefined : dateArg(opts.end, "--end");
      assertDateOrder(startDate, endDate, "sprint");
      const { boardId, mode } = sprintContext(opts, cmd);
      const created = await new SprintService().create(boardId, {
        name,
        goal: opts.goal,
        startDate,
        endDate,
      });
      const view = sprintSummary(created);
      printResult(mode, view, () => `Created sprint ${view.id}.\n${renderSprint(view)}`);
    });
}
