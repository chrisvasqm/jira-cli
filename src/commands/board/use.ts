import type { Command } from "commander";
import { boardId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { saveConfig } from "../../core/config.js";
import { printResult } from "../../core/output.js";
import { BoardService } from "../../services/board.service.js";

export function registerUse(board: Command): void {
  board
    .command("use <id>")
    .description("Make a board the default, and its project the default for new tickets")
    .action(async (rawId: string, _opts: unknown, cmd: Command) => {
      const id = boardId(rawId);
      const { config, configPath, mode } = bootstrap(cmd);
      const found = await new BoardService().get(id);
      const projectKey = found.location?.projectKey ?? config.projectKey;
      saveConfig(configPath, { ...config, boardId: id, projectKey });
      const result = { boardId: id, name: found.name, projectKey, config: configPath };
      printResult(mode, result, () => `Now using ${found.name} (#${id}), project ${projectKey}.`);
    });
}
