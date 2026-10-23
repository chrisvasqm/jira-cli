import { CliError } from "./errors.js";

export type OutputMode = "human" | "json";

export function printResult(mode: OutputMode, data: unknown, human: () => string): void {
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
    return;
  }
  process.stdout.write(`${stripControls(human())}\n`);
}

const ESC = 0x1b;
const BEL = 0x07;

/**
 * Jira text is user-written, so drop terminal escape sequences and control
 * characters (except newline and tab) before it reaches a terminal.
 */
export function stripControls(text: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === ESC) {
      index = skipEscape(text, index);
      continue;
    }
    if (!isControl(code)) out += text[index];
    index += 1;
  }
  return out;
}

function isControl(code: number): boolean {
  if (code === 0x0a || code === 0x09) return false;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/** Index just past the escape sequence starting at `start` (OSC, CSI or a two-byte escape). */
function skipEscape(text: string, start: number): number {
  const kind = text[start + 1];
  let index = start + 2;
  if (kind === "]") {
    while (index < text.length && text.charCodeAt(index) !== BEL && text.charCodeAt(index) !== ESC)
      index += 1;
    if (text.charCodeAt(index) === ESC && text[index + 1] === "\\") return index + 2;
    return text.charCodeAt(index) === BEL ? index + 1 : index;
  }
  if (kind !== "[") return Math.min(index, text.length);
  while (index < text.length && !isFinalByte(text.charCodeAt(index))) index += 1;
  return index + 1;
}

function isFinalByte(code: number): boolean {
  return code >= 0x40 && code <= 0x7e;
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
