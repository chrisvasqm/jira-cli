import { CliError } from "./errors.js";

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Accepts "abc-12" or "ABC-12" and returns "ABC-12". */
export function issueKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new CliError("USAGE", `"${raw}" is not an issue key like ABC-123`);
  return key;
}

/** Whole number >= min, written as plain digits. */
export function intAtLeast(raw: string, flag: string, min: number): number {
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(value >= min)) throw new CliError("USAGE", `${flag} must be a whole number of at least ${min}`);
  return value;
}

/** Map Jira's 404 for an issue URL to a clear message about the key. */
export function ticketNotFound(key: string): (err: unknown) => never {
  return (err: unknown) => {
    if (err instanceof CliError && err.code === "NOT_FOUND") {
      throw new CliError("TICKET_NOT_FOUND", `Ticket ${key} does not exist or you cannot see it.`);
    }
    throw err;
  };
}
