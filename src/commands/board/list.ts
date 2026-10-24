import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { BoardService } from "../../services/board.service.js";

interface BoardListItem {
  id: number;
  name: string;
  type: string;
  projectKey: string | null;
  current: boolean;
}

export function registerList(board: Command): void {
  board
    .command("list")
    .description("List the boards you can see; * marks the configured one")
    .action(async (_opts: unknown, cmd: Command) => {
      const { config, mode } = bootstrap(cmd);
      const boards = await new BoardService().listAll();
      const items: BoardListItem[] = boards.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        projectKey: item.location?.projectKey ?? null,
        current: item.id === config.boardId,
      }));
      printResult(mode, { boards: items }, () => renderHuman(items));
    });
}

function renderHuman(items: BoardListItem[]): string {
  if (items.length === 0) return "No boards found.";
  const width = Math.max(...items.map((item) => String(item.id).length));
  const lines = items.map((item) => {
    const mark = item.current ? "*" : " ";
    return `${mark} ${String(item.id).padStart(width)}  ${item.name}  [${item.type}, ${item.projectKey ?? "no project"}]`;
  });
  return [...lines, "", "Run: jira board view <id>, or jira board use <id> to make it the default"].join(
    "\n",
  );
}
