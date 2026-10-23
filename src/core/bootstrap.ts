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

/** Load config for the current directory and configure the HTTP client. */
export function bootstrap(cmd: Command): Context {
  const opts = cmd.optsWithGlobals<GlobalOptions>();
  const { config } = loadConfig(opts.config);
  HttpClient.configure(config);
  return { config, mode: opts.json ? "json" : "human" };
}
