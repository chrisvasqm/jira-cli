import type { Command } from "commander";
import { registerAdd } from "./add.js";
import { registerDelete } from "./delete.js";
import { registerEdit } from "./edit.js";
import { registerList } from "./list.js";

export function registerComment(program: Command): void {
  const comment = program.command("comment").description("Read and write a ticket's comments");
  registerList(comment);
  registerAdd(comment);
  registerEdit(comment);
  registerDelete(comment);
}
