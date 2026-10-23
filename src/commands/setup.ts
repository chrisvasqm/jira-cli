import { basename, join, resolve } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { CONFIG_FILE, GLOBAL_CONFIG, configSchema, isGitignored, saveConfig } from "../core/config.js";
import { CliError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { printResult, table, type OutputMode } from "../core/output.js";
import { ask, askSecret } from "../core/prompt.js";
import { BoardService } from "../services/board.service.js";
import { UserService } from "../services/user.service.js";

interface SetupOptions {
  global?: boolean;
  json?: boolean;
  config?: string;
}

const shape = configSchema.shape;

async function askValid<T>(
  prompt: () => Promise<string>,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  hint: string,
): Promise<T> {
  for (;;) {
    const parsed = schema.safeParse(await prompt());
    if (parsed.success && parsed.data !== undefined) return parsed.data;
    process.stderr.write(`${hint}\n`);
  }
}

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description(`Create ${CONFIG_FILE} in the current directory by prompting for Jira details`)
    .option("--global", `Write to ${GLOBAL_CONFIG} instead`)
    .action(async (opts: SetupOptions, cmd: Command) => {
      const all = cmd.optsWithGlobals<SetupOptions>();
      const mode: OutputMode = all.json ? "json" : "human";
      if (opts.global && all.config)
        throw new CliError("INVALID_OPTIONS", "Use either --global or --config, not both.");
      const target = opts.global
        ? GLOBAL_CONFIG
        : all.config
          ? resolve(all.config)
          : join(process.cwd(), CONFIG_FILE);
      await runSetup(target, mode);
    });
}

async function runSetup(path: string, mode: OutputMode): Promise<void> {
  const baseUrl = await askValid(
    () => ask("Jira URL (e.g. https://acme.atlassian.net)"),
    shape.baseUrl,
    "Enter a full URL including https://",
  );
  const email = await askValid(
    () => ask("Atlassian account email"),
    shape.email,
    "Enter a valid email address",
  );
  const apiToken = await askValid(
    () => askSecret("API token (id.atlassian.com/manage/api-tokens)"),
    shape.apiToken,
    "Token cannot be empty",
  );

  HttpClient.configure({ baseUrl, email, apiToken });
  const me = await new UserService().myself();
  process.stderr.write(`Authenticated as ${me.displayName}\n`);

  const boards = await new BoardService().listAll();
  if (boards.length === 0) throw new CliError("NO_BOARDS", "This account can see no boards.");
  process.stderr.write(
    `${boards
      .map((b, i) => `${String(i + 1).padStart(3)}  ${b.name} (${b.type}, ${b.location?.projectKey ?? "?"})`)
      .join("\n")}\n`,
  );
  const choice = await askValid(
    () => ask("Pick a board number", "1"),
    z.coerce.number().int().min(1).max(boards.length),
    `Enter a number between 1 and ${boards.length}`,
  );
  const board = boards[choice - 1]!;

  const projectKey = await askValid(
    () => ask("Project key", board.location?.projectKey ?? ""),
    shape.projectKey,
    "Project key cannot be empty",
  );

  const config = configSchema.parse({ baseUrl, email, apiToken, projectKey, boardId: board.id });
  saveConfig(path, config);

  const ignored = path === GLOBAL_CONFIG ? undefined : isGitignored(path);
  const warning =
    ignored === false
      ? `${basename(path)} is not ignored by git (add it to .gitignore, or \`git rm --cached\` it if tracked) so the token is never committed.`
      : undefined;

  printResult(
    mode,
    { path, board: { id: board.id, name: board.name }, projectKey, accountId: me.accountId, warning },
    () =>
      [
        table([
          ["Config", path],
          ["Board", `${board.name} (#${board.id})`],
          ["Project", projectKey],
          ["Account", me.displayName],
        ]),
        warning ? `\nwarning: ${warning}` : "",
      ].join(""),
  );
}
