import { CliError } from "./errors.js";

/** User JQL that the CLI joins with AND and sorts itself, so it cannot carry its own ORDER BY. */
export function userJql(text: string): string {
  if (/\border\s+by\b/i.test(text)) throw new CliError("USAGE", "Leave ORDER BY out of --jql");
  return text;
}

/** JQL string literal with quotes and backslashes escaped. */
export function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
