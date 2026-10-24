import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import type { JiraUser } from "../../core/jira-types.js";
import { grid, printResult } from "../../core/output.js";
import { WatcherService } from "../../services/watcher.service.js";

interface WatcherList {
  key: string;
  watchCount: number;
  isWatching: boolean;
  watchers: JiraUser[];
}

export function registerList(watcher: Command): void {
  watcher
    .command("list <key>")
    .description("Show who watches a ticket, and whether you do")
    .action(async (rawKey: string, _opts: unknown, cmd: Command) => {
      const key = issueKey(rawKey);
      const { mode } = bootstrap(cmd);
      const found = await new WatcherService().list(key);
      const view: WatcherList = {
        key,
        watchCount: found.watchCount,
        isWatching: found.isWatching,
        watchers: found.watchers.map(({ accountId, displayName }) => ({ accountId, displayName })),
      };
      printResult(mode, view, () => renderHuman(view));
    });
}

function renderHuman(view: WatcherList): string {
  const you = view.isWatching ? "You watch it." : "You do not watch it.";
  if (view.watchCount === 0) return `${view.key} has no watchers. ${you}`;
  const head = `${view.key}: ${view.watchCount} watcher${view.watchCount === 1 ? "" : "s"}. ${you}`;
  // Without "View voters and watchers" Jira gives the count but not the people.
  if (view.watchers.length === 0) return `${head}\nYou cannot see who they are.`;
  const rows = view.watchers.map((user) => [user.displayName, user.accountId]);
  return `${head}\n\n${grid([["NAME", "ACCOUNT ID"], ...rows])}`;
}
