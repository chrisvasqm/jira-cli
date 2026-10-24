import type { Command } from "commander";
import { registerAdd } from "./add.js";
import { registerDelete } from "./delete.js";
import { registerList } from "./list.js";

export function registerWorklog(program: Command): void {
  const worklog = program.command("worklog").description("Log and read the time spent on a ticket");
  registerList(worklog);
  registerAdd(worklog);
  registerDelete(worklog);
}
