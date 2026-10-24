import type { Command } from "commander";
import { registerAdd } from "./add.js";
import { registerList } from "./list.js";
import { registerRemove } from "./remove.js";
import { registerTypes } from "./types.js";

export function registerLink(program: Command): void {
  const link = program.command("link").description("Read and write a ticket's issue links and web links");
  registerList(link);
  registerAdd(link);
  registerRemove(link);
  registerTypes(link);
}
