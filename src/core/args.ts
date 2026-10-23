import { CliError } from "./errors.js";

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Accepts "abc-12" or "ABC-12" and returns "ABC-12". */
export function issueKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new CliError("USAGE", `"${raw}" is not an issue key like ABC-123`);
  return key;
}

export function nonNegativeInt(raw: string, flag: string): number {
  if (!/^\d+$/.test(raw)) throw new CliError("USAGE", `${flag} must be a whole number`);
  return Number(raw);
}
