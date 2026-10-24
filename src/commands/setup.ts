import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { globalOptions, outputMode } from "../core/bootstrap.js";
import { CONFIG_FILE, GLOBAL_CONFIG, configSchema, isGitignored, saveConfig } from "../core/config.js";
import { confirm } from "../core/confirm.js";
import { CliError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { info, printResult, table, type OutputMode } from "../core/output.js";
import { ask, askSecret } from "../core/prompt.js";
import { BoardService } from "../services/board.service.js";
import { UserService } from "../services/user.service.js";

interface SetupOptions {
  global?: boolean;
  yes?: boolean;
}

const shape = configSchema.shape;

async function askValid<T>(
  prompt: () => Promise<string>,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
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
    .option("-g, --global", `Write to ${GLOBAL_CONFIG} instead`)
    .option("-y, --yes", "Overwrite an existing config without asking")
    .action(async (opts: SetupOptions, cmd: Command) => {
      const all = globalOptions(cmd);
      const mode = outputMode(cmd);
      if (opts.global && all.config)
        throw new CliError("USAGE", "Use either --global or --config, not both.");
      const target = opts.global ? GLOBAL_CONFIG : resolve(all.config ?? CONFIG_FILE);
      // Ask before anything else: replacing a config throws away its token and board.
      if (existsSync(target) && !opts.yes) await confirm(`${target} already exists. Replace it?`);
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
  const [me, boards] = await Promise.all([new UserService().myself(), new BoardService().listAll()]);
  info(`Authenticated as ${me.displayName}`);
  if (boards.length === 0) throw new CliError("NO_BOARDS", "This account can see no boards.");
  info(
    boards
      .map(
        (item, index) =>
          `${String(index + 1).padStart(3)}  ${item.name} (${item.type}, ${item.location?.projectKey ?? "?"})`,
      )
      .join("\n"),
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
