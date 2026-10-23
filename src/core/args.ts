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
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
  const range = max === Number.MAX_SAFE_INTEGER ? `of at least ${min}` : `from ${min} to ${max}`;
  throw new CliError("USAGE", `${flag} must be a whole number ${range}`);
}
