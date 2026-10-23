import { CliError } from "./errors.js";

export type OutputMode = "human" | "json";

export function printResult(mode: OutputMode, data: unknown, human: () => string): void {
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
    return;
  }
  process.stdout.write(`${human()}\n`);
}

export function printError(mode: OutputMode, err: unknown): void {
  const code = err instanceof CliError ? err.code : "UNEXPECTED";
  const message = err instanceof Error ? err.message : String(err);
  const details = err instanceof CliError ? err.details : undefined;
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message, details } })}\n`);
    return;
  }
  process.stderr.write(`error [${code}]: ${message}\n`);
}

export function table(rows: ReadonlyArray<readonly [string, string]>): string {
  const width = Math.max(...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `${key.padEnd(width)}  ${value}`).join("\n");
}
