import type { Command } from "commander";
import { registerList } from "./list.js";

export function registerComponent(program: Command): void {
  const component = program.command("component").description("See a project's components");
  registerList(component);
}
