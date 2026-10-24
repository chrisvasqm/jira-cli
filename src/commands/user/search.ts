import type { Command } from "commander";
import { intInRange, projectKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { grid, printResult } from "../../core/output.js";
import { UserService } from "../../services/user.service.js";

interface SearchOptions {
  limit: string;
  project?: string;
}

interface UserRow {
  accountId: string;
  name: string;
  email: string | null;
  active: boolean;
}

/** Jira's cap on maxResults for user searches. */
const MAX_LIMIT = 1000;

export function registerSearch(user: Command): void {
  user
    .command("search <text>")
    .description("Active people whose name or email starts with the text")
    .option("-n, --limit <n>", "Maximum users to show (1-1000)", "20")
    .option("-k, --project <KEY>", "Only people who can be assigned tickets in this project")
    .action(async (text: string, opts: SearchOptions, cmd: Command) => {
      const query = text.trim();
      if (query === "") throw new CliError("USAGE", "Give a name or email to search for");
      const limit = intInRange(opts.limit, "--limit", 1, MAX_LIMIT);
      const project = opts.project === undefined ? undefined : projectKey(opts.project);
      const { mode } = bootstrap(cmd);
      const found = await new UserService().search(query, limit, project);
      const users: UserRow[] = found.map((one) => ({
        accountId: one.accountId,
        name: one.displayName,
        email: one.emailAddress ?? null,
        active: one.active !== false,
      }));
      printResult(mode, { users }, () => renderHuman(query, users));
    });
}

function renderHuman(query: string, users: UserRow[]): string {
  if (users.length === 0) return `No active users match "${query}".`;
  const rows = users.map((one) => [one.name, one.email ?? "-", one.accountId]);
  return grid([["NAME", "EMAIL", "ACCOUNT ID"], ...rows]);
}
