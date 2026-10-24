import type { Command } from "commander";
import { registerAdd } from "./add.js";
import { registerList } from "./list.js";
import { registerRemove } from "./remove.js";

export function registerWatcher(program: Command): void {
  const watcher = program.command("watcher").description("See and change who watches a ticket");
  registerList(watcher);
  registerAdd(watcher);
  registerRemove(watcher);
}
