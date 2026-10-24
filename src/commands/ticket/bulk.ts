import { stdin } from "node:process";
import type { Command } from "commander";
import { intInRange, issueKey } from "../../core/args.js";
import type { Config } from "../../core/config.js";
import { confirm } from "../../core/confirm.js";
import { CliError } from "../../core/errors.js";
import { quote, userJql } from "../../core/jql.js";
import { info, printResult, type OutputMode } from "../../core/output.js";
import { SearchService } from "../../services/search.service.js";

/** `-q`, `-n` and `-y` on `ticket edit` and `ticket move`, which pick several tickets. */
export interface BulkOptions {
  jql?: string;
  limit: string;
  yes?: boolean;
}

/** One key keeps the single-ticket behaviour; a key list or `--jql` is a bulk run. */
export type Selection =
  { bulk: false; key: string } | { bulk: true; keys: string[] } | { bulk: true; jql: string };

export interface BulkFailure {
  key: string;
  code: string;
  message: string;
}

export interface BulkResult<T> {
  updated: T[];
  failed: BulkFailure[];
}

const MAX_TICKETS = 200;
/** Parallel writes; the HTTP client already backs off on 429. */
const CONCURRENCY = 5;

export function bulkOptions(cmd: Command): Command {
  return cmd
    .option("-q, --jql <query>", "Pick tickets with JQL (joined with AND to the configured project)")
    .option("-n, --limit <n>", `With --jql: fail if more than this many match (1-${MAX_TICKETS})`, "50")
    .option("-y, --yes", "Change several tickets without asking");
}

/** Check the key list and flags before any network call, so usage errors come first. */
export function parseSelection(raw: string | undefined, opts: BulkOptions): Selection {
  intInRange(opts.limit, "--limit", 1, MAX_TICKETS);
  if (raw !== undefined && opts.jql !== undefined) {
    throw new CliError("USAGE", "Pass ticket keys or --jql, not both");
  }
  if (opts.jql !== undefined) {
    if (!opts.jql.trim()) throw new CliError("USAGE", "--jql cannot be empty");
    return { bulk: true, jql: userJql(opts.jql) };
  }
  if (raw === undefined)
    throw new CliError("USAGE", "Pass a ticket key, a comma-separated key list or --jql");
  const keys = [
    ...new Set(
      raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map(issueKey),
    ),
  ];
  const [first] = keys;
  if (!first) throw new CliError("USAGE", `"${raw}" is not an issue key like ABC-123`);
  return keys.length === 1 ? { bulk: false, key: first } : { bulk: true, keys };
}

/** The keys to change: the one key, the key list, or the tickets `--jql` matches. */
export async function selectedKeys(
  selection: Selection,
  opts: BulkOptions,
  config: Config,
): Promise<string[]> {
  if (!selection.bulk) return [selection.key];
  return "keys" in selection ? selection.keys : selectByJql(selection.jql, opts, config);
}

/** Keys matching `--jql` in the configured project; refuses a query wider than `--limit`. */
async function selectByJql(jql: string, opts: BulkOptions, config: Config): Promise<string[]> {
  const limit = intInRange(opts.limit, "--limit", 1, MAX_TICKETS);
  const query = `project = ${quote(config.projectKey)} AND (${jql}) ORDER BY key ASC`;
  const found = await new SearchService().search(query, ["summary"], { limit });
  if (found.hasMore) {
    throw new CliError(
      "TOO_MANY_TICKETS",
      `More than ${limit} tickets match. Narrow the query or raise --limit (max ${MAX_TICKETS}).`,
      { jql: query, limit },
    );
  }
  if (found.issues.length === 0) throw new CliError("NO_TICKETS", "No tickets match.", { jql: query });
  return found.issues.map((issue) => issue.key);
}

/** List the tickets and the change on a terminal and ask; without one, `--yes` is required. */
export async function confirmBulk(keys: string[], change: string, yes: boolean | undefined): Promise<void> {
  if (yes) return;
  if (stdin.isTTY) info(keys.join("\n"));
  await confirm(
    `${change} on ${keys.length} tickets (${keys.slice(0, 5).join(", ")}${keys.length > 5 ? ", …" : ""})?`,
  );
}

/** Run `apply` for every key, a few at a time, and keep going after a failure. */
export async function applyAll<T>(
  keys: string[],
  apply: (key: string) => Promise<T>,
): Promise<BulkResult<T>> {
  const outcomes: ({ ok: true; value: T } | { ok: false; failure: BulkFailure })[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < keys.length) {
      const index = next++;
      const key = keys[index] ?? "";
      outcomes[index] = await apply(key).then(
        (value) => ({ ok: true as const, value }),
        (err: unknown) => ({ ok: false as const, failure: toFailure(key, err) }),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
  const result: BulkResult<T> = { updated: [], failed: [] };
  for (const outcome of outcomes) {
    if (outcome.ok) result.updated.push(outcome.value);
    else result.failed.push(outcome.failure);
  }
  return result;
}

function toFailure(key: string, err: unknown): BulkFailure {
  const code = err instanceof CliError ? err.code : "UNEXPECTED";
  const message = err instanceof Error ? err.message : String(err);
  return { key, code, message };
}

/**
 * Print `{updated, failed}`. Exit 1 when any ticket failed; when all failed the
 * result is an error (`BULK_FAILED`) with the failures as details.
 */
export function printBulk<T>(mode: OutputMode, result: BulkResult<T>, line: (item: T) => string): void {
  const total = result.updated.length + result.failed.length;
  if (result.updated.length === 0) {
    // The error's details are structured for --json; people see one line per ticket.
    if (mode === "human") info(result.failed.map(failureLine).join("\n"));
    throw new CliError("BULK_FAILED", `All ${total} tickets failed.`, { failed: result.failed });
  }
  printResult(mode, result, () =>
    [
      ...result.updated.map(line),
      ...result.failed.map(failureLine),
      `Updated ${result.updated.length} of ${total} tickets.`,
    ].join("\n"),
  );
  if (result.failed.length > 0) process.exitCode = 1;
}

function failureLine(failure: BulkFailure): string {
  return `Failed ${failure.key} [${failure.code}]: ${failure.message}`;
}
