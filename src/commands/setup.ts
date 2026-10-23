import { join } from "node:path";
import type { Command } from "commander";
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
}

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description(`Create ${CONFIG_FILE} in the current directory by prompting for Jira details`)
    .option("--global", `Write to ${GLOBAL_CONFIG} instead`)
    .action(async (opts: SetupOptions, cmd: Command) => {
      const mode: OutputMode = cmd.optsWithGlobals<SetupOptions>().json ? "json" : "human";
      await runSetup(opts.global ?? false, mode);
    });
}

async function runSetup(global: boolean, mode: OutputMode): Promise<void> {
  const baseUrl = await ask("Jira URL (e.g. https://acme.atlassian.net)");
  const email = await ask("Atlassian account email");
  const apiToken = await askSecret("API token (id.atlassian.com/manage/api-tokens)");

  HttpClient.configure({ baseUrl: baseUrl.replace(/\/+$/, ""), email, apiToken });
  const me = await new UserService().myself();
  process.stderr.write(`Authenticated as ${me.displayName}\n`);

  const boards = await new BoardService().listAll();
  if (boards.length === 0) throw new CliError("NO_BOARDS", "This account can see no boards.");
  process.stderr.write(
    `${boards
      .map((b, i) => `${String(i + 1).padStart(3)}  ${b.name} (${b.type}, ${b.location?.projectKey ?? "?"})`)
      .join("\n")}\n`,
  );
  const choice = Number(await ask("Pick a board number", "1"));
  const board = boards[choice - 1];
  if (!board) throw new CliError("INVALID_CHOICE", `No board number ${choice}.`);

  const projectKey = await ask("Project key", board.location?.projectKey ?? "");

  const config = configSchema.parse({ baseUrl, email, apiToken, projectKey, boardId: board.id });
  const path = global ? GLOBAL_CONFIG : join(process.cwd(), CONFIG_FILE);
  saveConfig(path, config);

  const ignored = global ? undefined : isGitignored(path);
  const warning =
    ignored === false ? `${CONFIG_FILE} is not in .gitignore. Add it so the token is never committed.` : undefined;

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
