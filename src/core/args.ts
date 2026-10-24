import { CliError } from "./errors.js";

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Accepts "abc-12" or "ABC-12" and returns "ABC-12". */
export function issueKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new CliError("USAGE", `"${raw}" is not an issue key like ABC-123`);
  return key;
}

/** Whole number between min and max (inclusive), written as plain digits. */
export function intInRange(raw: string, flag: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
  const range = max === Number.MAX_SAFE_INTEGER ? `of at least ${min}` : `from ${min} to ${max}`;
  throw new CliError("USAGE", `${flag} must be a whole number ${range}`);
}

export function boardId(raw: string): number {
  return intInRange(raw, "board id", 1);
}

/** Project keys are upper-case letters and digits, e.g. "KAN"; accepts "kan". */
export function projectKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new CliError("USAGE", `"${raw}" is not a project key like ABC`);
  return key;
}

/** Comment ids are numeric; accepts "#10001" as shown in the output. */
export function commentId(raw: string): string {
  const id = raw.trim().replace(/^#/, "");
  if (!/^\d+$/.test(id)) throw new CliError("USAGE", `"${raw}" is not a comment id like 10001`);
  return id;
}

/** "2026-10-24" (local midnight) or a full ISO timestamp, as an ISO string for Jira. */
/** Throws USAGE unless `end` is after `start` (both ISO strings, when given). */
export function assertDateOrder(start: string | undefined, end: string | undefined): void {
  if (start && end && Date.parse(end) <= Date.parse(start)) {
    throw new CliError("USAGE", "The sprint must end after it starts");
  }
}

export function dateArg(raw: string, flag: string): string {
  const text = raw.trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const date = text.length === 10 ? new Date(`${text}T00:00:00`) : new Date(text);
  // Date rolls 2026-02-30 over to March; a real date keeps its day of the month.
  if (day && !Number.isNaN(date.getTime()) && (text.length > 10 || date.getDate() === Number(day[3]))) {
    return date.toISOString();
  }
  throw new CliError("USAGE", `${flag} must be a date like 2026-10-24 or an ISO timestamp`);
}
