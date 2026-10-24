import type { Command } from "commander";
import { registerClose } from "./close.js";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";
import { registerStart } from "./start.js";
import { registerView } from "./view.js";

export function registerSprint(program: Command): void {
  const sprint = program
    .command("sprint")
    .description("List, create, start, close and delete a board's sprints");
  registerList(sprint);
  registerView(sprint);
  registerCreate(sprint);
  registerEdit(sprint);
  registerStart(sprint);
  registerClose(sprint);
  registerDelete(sprint);
}
