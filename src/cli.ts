import { createRequire } from "node:module";
import { CommanderError } from "commander";
import { registerBoard } from "./commands/board/index.js";
import { registerComment } from "./commands/comment/index.js";
import { registerReport } from "./commands/report/index.js";
import { registerSetup } from "./commands/setup.js";
import { registerSprint } from "./commands/sprint/index.js";
import { registerTicket } from "./commands/ticket/index.js";
import { CliError } from "./core/errors.js";
import { outputMode } from "./core/bootstrap.js";
import { expandShortFlags, FlagCommand } from "./core/flags.js";
import { printError } from "./core/output.js";
import { closePrompts } from "./core/prompt.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new FlagCommand()
  .name("jira")
  .description("Jira from the terminal, for humans and agents")
  .version(version, "-v, --version", "Print the version")
  .option("-j, --json", "Machine-readable output")
  .option("-c, --config <path>", "Path to a config file (default: nearest .jira-cli.json)")
  .exitOverride()
  // Commander's own error lines are dropped (printError reports them); help text still prints.
  .configureOutput({ outputError: () => undefined });

registerSetup(program);
registerBoard(program);
registerTicket(program);
registerSprint(program);
registerComment(program);
registerReport(program);

/** 130 for Ctrl+C, 2 for bad usage or missing input, 1 for everything else. */
function exitCode(err: unknown): number {
  if (err instanceof CliError && err.code === "INTERRUPTED") return 130;
  if (err instanceof CliError && (err.code === "USAGE" || err.code === "INPUT_EOF")) return 2;
  return 1;
}

/** Help was shown: `--help` exits 0; a command group run without a subcommand exits 2. */
function isHelp(err: unknown): err is CommanderError {
  return (
    err instanceof CommanderError &&
    ["commander.help", "commander.helpDisplayed", "commander.version"].includes(err.code)
  );
}

function toCliError(err: unknown): unknown {
  if (err instanceof CommanderError) {
    return new CliError("USAGE", err.message.replace(/^error: /, ""));
  }
  return err;
}

program
  .parseAsync(expandShortFlags(process.argv))
  .then(() => closePrompts())
  .catch((raw: unknown) => {
    closePrompts();
    if (isHelp(raw)) process.exit(raw.exitCode === 0 ? 0 : 2);
    const err = toCliError(raw);
    printError(outputMode(program), err);
    process.exit(exitCode(err));
  });
