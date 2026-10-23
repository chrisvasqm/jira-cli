import type { Command } from "commander";
import { registerView } from "./view.js";

export function registerTicket(program: Command): void {
  const ticket = program.command("ticket").description("Work with a single ticket");
  registerView(ticket);
}
