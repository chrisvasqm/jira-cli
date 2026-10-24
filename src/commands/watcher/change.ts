import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { UserService } from "../../services/user.service.js";
import { WatcherService } from "../../services/watcher.service.js";

interface WatchChange {
  key: string;
  accountId: string;
  displayName: string;
  watching: boolean;
  /** False when the user already was (add) or was not (remove) a watcher. */
  changed: boolean;
  note: string | null;
}

/**
 * Shared action of `watcher add` and `watcher remove`: resolve the user, read the
 * watchers, and call Jira only when the state differs, so both are idempotent.
 */
export async function changeWatch(rawKey: string, who: string, watch: boolean, cmd: Command): Promise<void> {
  const key = issueKey(rawKey);
  const { mode } = bootstrap(cmd);
  const users = new UserService();
  const service = new WatcherService();
  const [me, current] = await Promise.all([users.myself(), service.list(key)]);
  const user = who === "me" ? me : await users.resolve(who);
  const isMe = user.accountId === me.accountId;
  const watching = current.watchers.some((watcher) => watcher.accountId === user.accountId);
  // A hidden watcher list (no "View voters and watchers") cannot prove someone is absent.
  const hidden = current.watchers.length < current.watchCount;
  const unchanged = watch
    ? watching || (isMe && current.isWatching)
    : !watching && (isMe ? !current.isWatching : !hidden);
  if (!unchanged) await (watch ? service.add(key, user.accountId) : service.remove(key, user.accountId));
  const view: WatchChange = {
    key,
    accountId: user.accountId,
    displayName: user.displayName,
    watching: watch,
    changed: !unchanged,
    note: unchanged ? `${watch ? "Already watching" : "Was not watching"} ${key}` : null,
  };
  printResult(mode, view, () => renderHuman(view, isMe));
}

function renderHuman(view: WatchChange, isMe: boolean): string {
  const who = isMe ? "You" : view.displayName;
  if (view.note) return `${who}: ${view.note}.`;
  return view.watching ? `${who} now watching ${view.key}.` : `${who} no longer watching ${view.key}.`;
}
