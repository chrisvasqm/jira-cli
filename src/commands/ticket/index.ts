import type { Command } from "commander";
import { registerCreate } from "./create.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";
import { registerMove } from "./move.js";
import { registerRank } from "./rank.js";
import { registerView } from "./view.js";

export function registerTicket(program: Command): void {
  const ticket = program.command("ticket").description("Search tickets and work with a single ticket");
  registerList(ticket);
  registerCreate(ticket);
  registerView(ticket);
  registerEdit(ticket);
  registerMove(ticket);
  registerRank(ticket);
  registerDelete(ticket);
}
