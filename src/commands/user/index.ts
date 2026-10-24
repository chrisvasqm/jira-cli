import type { Command } from "commander";
import { registerSearch } from "./search.js";
import { registerView } from "./view.js";

export function registerUser(program: Command): void {
  const user = program.command("user").description("Find Jira users");
  registerSearch(user);
  registerView(user);
}
