#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command, CommanderError } from "commander";
import { registerBoard } from "./commands/board.js";
import { registerSetup } from "./commands/setup.js";
import { CliError } from "./core/errors.js";
import { printError } from "./core/output.js";
import { closePrompts } from "./core/prompt.js";

const MIN_NODE = 24;
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < MIN_NODE) {
  process.stderr.write(`jira needs Node.js ${MIN_NODE} or newer (you have ${process.versions.node}).\n`);
  process.exit(1);
}

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command()
  .name("jira")
  .description("Jira from the terminal, for humans and agents")
  .version(version, "-v, --version", "Print the version")
  .option("--json", "Machine-readable output")
  .option("--config <path>", "Path to a config file (default: nearest .jira-cli.json)")
  .exitOverride()
  .configureOutput({ writeErr: () => undefined });

registerSetup(program);
registerBoard(program);

function exitCode(err: unknown): number {
  if (err instanceof CliError && err.code === "INTERRUPTED") return 130;
  if (err instanceof CliError && err.code === "INPUT_EOF") return 2;
  return 1;
}

function toCliError(err: unknown): unknown {
  if (err instanceof CommanderError) {
    return new CliError("USAGE", err.message.replace(/^error: /, ""));
  }
  return err;
}

program
  .parseAsync(process.argv)
  .then(() => closePrompts())
  .catch((raw: unknown) => {
    closePrompts();
    if (raw instanceof CommanderError && raw.exitCode === 0) return;
    const err = toCliError(raw);
    printError(program.opts<{ json?: boolean }>().json ? "json" : "human", err);
    process.exit(exitCode(err));
  });
