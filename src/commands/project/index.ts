import type { Command } from "commander";
import { registerList } from "./list.js";

export function registerProject(program: Command): void {
  const project = program.command("project").description("See the projects you can use");
  registerList(project);
}
