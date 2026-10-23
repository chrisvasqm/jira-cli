import { createInterface, type Interface } from "node:readline";
import { stdin, stderr } from "node:process";
import { CliError } from "./errors.js";

const eof = (): CliError => new CliError("INPUT_EOF", "Input ended before all prompts were answered.");
const interrupted = (): CliError => new CliError("INTERRUPTED", "Cancelled.");

interface Waiter {
  resolve: (line: string) => void;
  reject: (err: Error) => void;
}

let rl: Interface | undefined;
let ended = false;
const queued: string[] = [];
const waiters: Waiter[] = [];

/**
 * One shared interface that buffers every line, so piped input is never dropped
 * between questions. Prompts go to stderr; stdout stays machine-readable.
 */
function iface(): Interface {
  if (rl) return rl;
  rl = createInterface({ input: stdin, output: stderr });
  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else queued.push(line);
  });
  rl.on("SIGINT", () => failAll(interrupted()));
  rl.on("close", () => {
    ended = true;
    failAll(eof());
  });
  return rl;
}

function failAll(err: Error): void {
  for (const waiter of waiters.splice(0)) waiter.reject(err);
}

/** Detach readline so it neither echoes nor buffers raw keystrokes. */
function suspend(): void {
  rl?.close();
  rl = undefined;
}

export function closePrompts(): void {
  suspend();
}

function nextLine(): Promise<string> {
  const line = queued.shift();
  if (line !== undefined) return Promise.resolve(line);
  if (ended) return Promise.reject(eof());
  return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
}

export async function ask(question: string, fallback?: string): Promise<string> {
  const io = iface();
  const suffix = fallback ? ` [${fallback}]` : "";
  io.setPrompt(`${question}${suffix}: `);
  io.prompt();
  const answer = (await nextLine()).trim();
  return answer || fallback || "";
}

export async function askSecret(question: string): Promise<string> {
  if (!stdin.isTTY) return ask(question);
  suspend();
  stderr.write(`${question}: `);
  return new Promise((resolvePromise, reject) => {
    let value = "";
    const finish = (settle: () => void): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stderr.write("\n");
      settle();
    };
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish(() => resolvePromise(value.trim()));
        if (char === "\u0003") return finish(() => reject(interrupted()));
        if (char === "\u0004") return finish(() => reject(eof()));
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.resume();
  });
}
