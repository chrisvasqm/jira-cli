import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stderr } from "node:process";
import { CliError } from "./errors.js";

const eof = (): CliError => new CliError("INPUT_EOF", "Input ended before all prompts were answered.");
const interrupted = (): CliError => new CliError("INTERRUPTED", "Cancelled.");

let rl: Interface | undefined;
let closed = false;

/** One shared interface so piped input is not swallowed between questions. Prompts go to stderr. */
function iface(): Interface {
  if (!rl) {
    rl = createInterface({ input: stdin, output: stderr });
    rl.on("close", () => {
      closed = true;
    });
  }
  return rl;
}

export function closePrompts(): void {
  rl?.close();
}

export async function ask(question: string, fallback?: string): Promise<string> {
  if (closed) throw eof();
  const io = iface();
  const suffix = fallback ? ` [${fallback}]` : "";
  const abort = new Promise<never>((_, reject) => {
    io.once("close", () => reject(eof()));
    io.once("SIGINT", () => reject(interrupted()));
  });
  const answer = (await Promise.race([io.question(`${question}${suffix}: `), abort])).trim();
  return answer || fallback || "";
}

export async function askSecret(question: string): Promise<string> {
  if (!stdin.isTTY) return ask(question);
  stderr.write(`${question}: `);
  return new Promise((resolvePromise, reject) => {
    let value = "";
    const finish = (fn: () => void): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stderr.write("\n");
      fn();
    };
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(() => resolvePromise(value));
        if (ch === "\u0003") return finish(() => reject(interrupted()));
        if (ch === "\u0004") return finish(() => reject(eof()));
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}
