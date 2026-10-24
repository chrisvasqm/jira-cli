import type { Command } from "commander";
import { registerList } from "./list.js";

export function registerFilter(program: Command): void {
  const filter = program.command("filter").description("See saved filters");
  registerList(filter);
}
