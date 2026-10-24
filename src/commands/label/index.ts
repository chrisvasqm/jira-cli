import type { Command } from "commander";
import { registerList } from "./list.js";

export function registerLabel(program: Command): void {
  const label = program.command("label").description("See the labels used on the site");
  registerList(label);
}
