#!/usr/bin/env node
import { Command } from "commander";
import { registerSetup } from "./commands/setup.js";
import { printError } from "./core/output.js";

const program = new Command()
  .name("jira")
  .description("Jira from the terminal, for humans and agents")
  .version("0.1.0")
  .option("--json", "Machine-readable output")
  .option("--config <path>", "Path to a config file (default: nearest .jira-cli.json)");

registerSetup(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  printError(program.opts<{ json?: boolean }>().json ? "json" : "human", err);
  process.exit(1);
});
