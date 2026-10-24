import type { Command } from "commander";
import { assertDateOrder, dateArg } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import type { Sprint } from "../../services/board.service.js";
import { SprintService } from "../../services/sprint.service.js";
import { renderSprint, sprintId, sprintIn, sprintSummary } from "./common.js";

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
    .option("-e, --end <date>", "End, e.g. 2026-11-07 (default: start plus the planned length, or two weeks)")
    .action(async (rawId: string, opts: StartOptions, cmd: Command) => {
      const id = sprintId(rawId);
      const start = opts.start === undefined ? undefined : dateArg(opts.start, "--start");
      const end = opts.end === undefined ? undefined : dateArg(opts.end, "--end");
      const { mode } = bootstrap(cmd);
      const planned = await sprintIn(id, "future", "start");
      const startDate = start ?? new Date().toISOString();
      const endDate = end ?? new Date(Date.parse(startDate) + plannedLength(planned)).toISOString();
      assertDateOrder(startDate, endDate);
      const view = sprintSummary(
        await new SprintService().update(id, { state: "active", startDate, endDate }),
      );
      printResult(mode, view, () => `Started sprint ${id}.\n${renderSprint(view)}`);
    });
}

/** The planned start-to-end length, or two weeks when the sprint has no planned dates. */
function plannedLength(sprint: Sprint): number {
  const length = Date.parse(sprint.endDate ?? "") - Date.parse(sprint.startDate ?? "");
  return Number.isFinite(length) && length > 0 ? length : TWO_WEEKS_MS;
}
