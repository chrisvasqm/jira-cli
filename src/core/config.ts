import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { CliError } from "./errors.js";

export const CONFIG_FILE = ".jira-cli.json";
export const GLOBAL_CONFIG = join(homedir(), ".config", "jira-cli", "config.json");

export const configSchema = z.object({
  baseUrl: z
    .url({ protocol: /^https$/, error: "Use the https:// address of your Jira site" })
    .transform((url) => url.replace(/\/+$/, "")),
  email: z.email(),
  apiToken: z.string().min(1),
  projectKey: z
    .string()
    .min(1)
    .transform((key) => key.trim().toUpperCase()),
  boardId: z.number().int().positive(),
});

export type Config = z.infer<typeof configSchema>;

function walkUp(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function findConfigPath(explicit?: string): string | undefined {
  if (explicit) return resolve(explicit);
  return walkUp(process.cwd()) ?? (existsSync(GLOBAL_CONFIG) ? GLOBAL_CONFIG : undefined);
}

export function loadConfig(explicit?: string): { path: string; config: Config } {
  const path = findConfigPath(explicit);
  if (!path) {
    throw new CliError("CONFIG_MISSING", `No ${CONFIG_FILE} found. Run \`jira setup\` first.`);
  }
  if (!existsSync(path)) {
    throw new CliError(
      "CONFIG_MISSING",
      `${path} does not exist. Run \`jira --config ${path} setup\` first.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new CliError("CONFIG_INVALID", `Could not read ${path}`, String(err));
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError("CONFIG_INVALID", `Invalid config at ${path}`, parsed.error.issues);
  }
  return { path, config: parsed.data };
}

export function saveConfig(path: string, config: Config): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Tighten an existing file before the token is written into it.
  if (existsSync(path)) chmodSync(path, 0o600);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** true = ignored, false = tracked by git and not ignored, undefined = not a git repo or git missing. */
export function isGitignored(configPath: string): boolean | undefined {
  const result = spawnSync("git", ["check-ignore", "-q", configPath], {
    cwd: dirname(configPath),
    stdio: "ignore",
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  return undefined;
}
