import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { saveConfig } from "../../core/config.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { BoardService } from "../../services/board.service.js";

export function registerUse(board: Command): void {
  board
    .command("use <id>")
    .description("Make a board the default, and its project the default for new tickets")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const boardId = intInRange(rawId, "board id", 1);
      const { config, configPath, mode } = bootstrap(cmd);
      const found = await new BoardService().get(boardId).catch((err: unknown) => {
        if (err instanceof CliError && err.code === "NOT_FOUND") {
          throw new CliError("BOARD_NOT_FOUND", `Board ${boardId} does not exist or you cannot see it.`);
        }
        throw err;
      });
      const projectKey = found.location?.projectKey ?? config.projectKey;
      saveConfig(configPath, { ...config, boardId, projectKey });
      const result = { boardId, name: found.name, projectKey, config: configPath };
      printResult(mode, result, () => `Now using ${found.name} (#${boardId}), project ${projectKey}.`);
    });
}
