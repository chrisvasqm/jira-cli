import type { Command } from "commander";
import { registerList } from "./list.js";
import { registerUse } from "./use.js";
import { registerView } from "./view.js";

export function registerBoard(program: Command): void {
  const board = program.command("board").description("See boards and their tickets");
  registerView(board);
  registerList(board);
  registerUse(board);
}
