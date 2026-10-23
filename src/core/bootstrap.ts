import type { Command } from "commander";
import { loadConfig, type Config } from "./config.js";
import { HttpClient } from "./http.js";
import type { OutputMode } from "./output.js";

export interface GlobalOptions {
  json?: boolean;
  config?: string;
}

export interface Context {
  config: Config;
  mode: OutputMode;
}

export function globalOptions(cmd: Command): GlobalOptions {
  return cmd.optsWithGlobals<GlobalOptions>();
}

export function outputMode(cmd: Command): OutputMode {
  return globalOptions(cmd).json ? "json" : "human";
}

/** Load config for the current directory and configure the HTTP client. */
export function bootstrap(cmd: Command): Context {
  const opts = globalOptions(cmd);
  const { config } = loadConfig(opts.config);
  HttpClient.configure(config);
  return { config, mode: opts.json ? "json" : "human" };
}
