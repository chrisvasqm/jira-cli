import type { Command } from "commander";
import { intInRange, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { ChangelogService, type Changelog } from "../../services/changelog.service.js";
import { localTime } from "../render.js";

interface HistoryOptions {
  limit: string;
}

interface Change {
  field: string;
  from: string | null;
  to: string | null;
}

interface HistoryEntry {
  id: string;
  created: string;
  author: { accountId: string; displayName: string } | null;
  changes: Change[];
}

interface HistoryView {
  key: string;
  total: number;
  /** Newest first. */
  entries: HistoryEntry[];
}

/** Longest value shown in human output (descriptions can be pages long); JSON keeps it whole. */
const MAX_VALUE_CHARS = 60;

export function registerHistory(ticket: Command): void {
  ticket
    .command("history <key>")
    .description("Show a ticket's change history, newest first")
    .option("-n, --limit <n>", "Maximum entries to show", "20")
    .action(async (rawKey: string, opts: HistoryOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const limit = intInRange(opts.limit, "--limit", 1);
      const { mode } = bootstrap(cmd);
      const history = await new ChangelogService().latest(key, limit);
      const view: HistoryView = { key, total: history.total, entries: history.entries.map(toEntry) };
      printResult(mode, view, () => renderHuman(view));
    });
}

function toEntry(log: Changelog): HistoryEntry {
  return {
    id: log.id,
    created: log.created,
    author: log.author ? { accountId: log.author.accountId, displayName: log.author.displayName } : null,
    changes: log.items.map((item) => ({
      field: item.field,
      from: item.fromString || null,
      to: item.toString || null,
    })),
  };
}

function renderHuman(view: HistoryView): string {
  if (view.total === 0) return `${view.key} has no history.`;
  const shown = view.entries.length;
  const heading =
    shown < view.total
      ? `${view.key} history (latest ${shown} of ${view.total})`
      : `${view.key} history (${view.total})`;
  const body = [heading, ...view.entries.map(renderEntry)].join("\n\n");
  return shown < view.total ? `${body}\n\nRaise --limit to see more.` : body;
}

/** "Ana · 2026-10-23 14:05 GMT-4" followed by one "field: from → to" line per change. */
function renderEntry(entry: HistoryEntry): string {
  const lines = entry.changes.map(
    (change) => `  ${change.field}: ${shorten(change.from)} → ${shorten(change.to)}`,
  );
  return [`${entry.author?.displayName ?? "unknown"} · ${localTime(entry.created)}`, ...lines].join("\n");
}

/** One line, cut to MAX_VALUE_CHARS; "(none)" for an empty value. */
function shorten(value: string | null): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "(none)";
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}
