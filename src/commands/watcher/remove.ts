import type { Command } from "commander";
import { changeWatch } from "./change.js";

/** Not confirmed: unwatching is easy to undo with `watcher add`. */
export function registerRemove(watcher: Command): void {
  watcher
    .command("remove <key> [user]")
    .description("Stop watching a ticket, or remove a watcher (me, email, name or accountId; default me)")
    .action((rawKey: string, who: string | undefined, _opts: unknown, cmd: Command) =>
      changeWatch(rawKey, who ?? "me", false, cmd),
    );
}
