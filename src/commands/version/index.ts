import type { Command } from "commander";
import { registerList } from "./list.js";

export function registerVersion(program: Command): void {
  const version = program.command("version").description("See a project's versions (fix versions)");
  registerList(version);
}
