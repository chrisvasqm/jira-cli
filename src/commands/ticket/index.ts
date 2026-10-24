import type { Command } from "commander";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerHistory } from "./history.js";
import { registerMove } from "./move.js";
import { registerView } from "./view.js";

export function registerTicket(program: Command): void {
  const ticket = program.command("ticket").description("Work with a single ticket");
  registerCreate(ticket);
  registerView(ticket);
  registerEdit(ticket);
  registerMove(ticket);
  registerHistory(ticket);
  registerDelete(ticket);
}
