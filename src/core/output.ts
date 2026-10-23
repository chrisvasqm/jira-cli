import { stripVTControlCharacters } from "node:util";
import { CliError } from "./errors.js";

export type OutputMode = "human" | "json";

export function printResult(mode: OutputMode, data: unknown, human: () => string): void {
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
    return;
  }
  process.stdout.write(`${stripControls(human())}\n`);
}

/** Control and invisible format characters, except newline, tab and the zero-width joiner emoji use. */
const HIDDEN = /(?![\n\t\u200d])[\p{Cc}\p{Cf}]/gu;

/**
 * Jira text is user-written, so drop terminal escape sequences, control characters
 * and invisible bidi or zero-width marks before it reaches a terminal.
 */
function stripControls(text: string): string {
  return stripVTControlCharacters(text).replace(HIDDEN, "");
}

export function printError(mode: OutputMode, err: unknown): void {
  const code = err instanceof CliError ? err.code : "UNEXPECTED";
  const message = err instanceof Error ? err.message : String(err);
  const details = err instanceof CliError ? err.details : undefined;
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message, details } })}\n`);
    return;
  }
  process.stderr.write(`error [${code}]: ${stripControls(message)}\n`);
  const rendered = renderDetails(details);
  if (rendered) process.stderr.write(`${stripControls(rendered)}\n`);
}

function renderDetails(details: unknown): string | undefined {
  if (details === undefined || details === null) return undefined;
  if (typeof details === "string") return details;
  if (typeof details === "object" && "errorMessages" in details) {
    const jira = details as { errorMessages?: string[]; errors?: Record<string, string> };
    const lines = [
      ...(jira.errorMessages ?? []),
      ...Object.entries(jira.errors ?? {}).map(([k, v]) => `${k}: ${v}`),
    ];
    if (lines.length > 0) return lines.map((line) => `  ${line}`).join("\n");
  }
  return JSON.stringify(details, null, 2);
}

export function table(rows: ReadonlyArray<readonly [string, string]>): string {
  const width = Math.max(...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `${key.padEnd(width)}  ${value}`).join("\n");
}
