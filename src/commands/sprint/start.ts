import type { Command } from "commander";
import { dateArg } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { SprintService } from "../../services/sprint.service.js";
import { renderSprint, sprintId, sprintIn, sprintView } from "./common.js";

interface StartOptions {
  start?: string;
  end?: string;
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export function registerStart(sprint: Command): void {
  sprint
    .command("start <id>")
    .description("Start a future sprint (default: now, for its planned length or two weeks)")
    .option("-s, --start <date>", "Start, e.g. 2026-10-24 (default: now)")
    .option("-e, --end <date>", "End, e.g. 2026-11-07 (default: planned end, or two weeks)")
    .action(async (rawId: string, opts: StartOptions, cmd: Command) => {
      const id = sprintId(rawId);
      const start = opts.start === undefined ? undefined : dateArg(opts.start, "--start");
      const end = opts.end === undefined ? undefined : dateArg(opts.end, "--end");
      const { mode } = bootstrap(cmd);
      await sprintIn(id, "future", "start");
      const startDate = start ?? new Date().toISOString();
      const endDate = end ?? new Date(Date.parse(startDate) + TWO_WEEKS_MS).toISOString();
      if (Date.parse(endDate) <= Date.parse(startDate)) {
        throw new CliError("USAGE", "The sprint must end after it starts");
      }
      const view = sprintView(await new SprintService().update(id, { state: "active", startDate, endDate }));
      printResult(mode, view, () => `Started sprint ${id}.\n${renderSprint(view)}`);
    });
}
