import type { Command } from "commander";
import { registerList } from "./list.js";

export function registerField(program: Command): void {
  const field = program.command("field").description("See the site's fields, e.g. to find a custom field id");
  registerList(field);
}
