import type { Command } from "commander";
import { changeWatch } from "./change.js";

export function registerAdd(watcher: Command): void {
  watcher
    .command("add <key> [user]")
    .description("Watch a ticket, or add a watcher (me, email, name or accountId; default me)")
    .action((rawKey: string, who: string | undefined, _opts: unknown, cmd: Command) =>
      changeWatch(rawKey, who ?? "me", true, cmd),
    );
}
