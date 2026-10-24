import type { Command } from "commander";
import { registerList } from "./list.js";
import { registerView } from "./view.js";

export function registerEpic(program: Command): void {
  const epic = program.command("epic").description("See epics and the progress of their tickets");
  registerList(epic);
  registerView(epic);
}
