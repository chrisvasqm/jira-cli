import type { Command } from "commander";
import { registerAdd } from "./add.js";
import { registerDelete } from "./delete.js";
import { registerGet } from "./get.js";
import { registerList } from "./list.js";

export function registerAttachment(program: Command): void {
  const attachment = program
    .command("attachment")
    .description("List, upload, download and delete a ticket's attachments");
  registerList(attachment);
  registerAdd(attachment);
  registerGet(attachment);
  registerDelete(attachment);
}
