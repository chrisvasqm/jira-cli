import type { Command } from "commander";
import { CliError } from "../../core/errors.js";
import { grid, printResult } from "../../core/output.js";
import { BoardService } from "../../services/board.service.js";
import { localDate } from "../report/common.js";
import { sprintContext, sprintSummary, type BoardOptions } from "./common.js";

interface ListOptions extends BoardOptions {
  state: string;
}

const STATES = new Map(
  Object.entries({
    open: "active,future",
    active: "active",
    future: "future",
    closed: "closed",
    all: "active,future,closed",
  }),
);

export function registerList(sprint: Command): void {
  sprint
    .command("list")
    .description("List a board's sprints (default: active and future)")
    .option("-b, --board <id>", "Board id (default: the configured board)")
    .option("-S, --state <state>", "open, active, future, closed or all", "open")
    .action(async (opts: ListOptions, cmd: Command) => {
      const state = STATES.get(opts.state.trim().toLowerCase());
      if (!state) throw new CliError("USAGE", "--state takes open, active, future, closed or all");
      const { boardId, mode } = sprintContext(opts, cmd);
      const found = await new BoardService().sprints(boardId, state);
      if (found === undefined) throw new CliError("NO_SPRINTS", `Board ${boardId} does not use sprints.`);
      const sprints = found.map(sprintSummary);
      printResult(mode, { boardId, sprints }, () =>
        sprints.length === 0
          ? "No sprints."
          : grid(
              sprints.map((item) => [
                String(item.id),
                item.state,
                item.name,
                `${localDate(item.startDate)} → ${localDate(item.endDate)}`,
              ]),
            ),
      );
    });
}
