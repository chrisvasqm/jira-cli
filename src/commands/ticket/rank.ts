import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { MAX_RANK, RankService, type RankTarget } from "../../services/rank.service.js";

interface RankOptions {
  before?: string;
  after?: string;
}

export function registerRank(ticket: Command): void {
  ticket
    .command("rank <keys...>")
    .description(`Move tickets (at most ${MAX_RANK}, in this order) before or after another in the backlog`)
    .option("-bf, --before <KEY>", "Put the tickets right before this ticket")
    .option("-af, --after <KEY>", "Put the tickets right after this ticket")
    .action(async (rawKeys: string[], opts: RankOptions, cmd: Command) => {
      const keys = uniqueKeys(rawKeys);
      const target = rankTarget(opts, keys);
      const { mode } = bootstrap(cmd);
      const failed = await new RankService().rank(keys, target);
      const failedKeys = new Set(failed.map((item) => item.key));
      const result = { ranked: keys.filter((key) => !failedKeys.has(key)), ...target, failed };
      if (failed.length > 0) {
        const list = failed.map((item) => `${item.key}: ${item.message}`);
        throw new CliError("RANK_FAILED", `Jira did not rank ${failed.length} of ${keys.length} tickets`, {
          ...result,
          errorMessages: list,
        });
      }
      printResult(mode, result, () => `Ranked ${keys.join(", ")} ${where(target)}.`);
    });
}

function uniqueKeys(rawKeys: string[]): string[] {
  const keys = [...new Set(rawKeys.map(issueKey))];
  if (keys.length > MAX_RANK) {
    throw new CliError("USAGE", `Jira ranks at most ${MAX_RANK} tickets at once (got ${keys.length})`);
  }
  return keys;
}

/** Exactly one of --before and --after, and not one of the tickets being moved. */
function rankTarget(opts: RankOptions, keys: string[]): RankTarget {
  if ((opts.before === undefined) === (opts.after === undefined)) {
    throw new CliError("USAGE", "Pass exactly one of --before <KEY> and --after <KEY>");
  }
  const target: RankTarget =
    opts.before === undefined ? { after: issueKey(opts.after ?? "") } : { before: issueKey(opts.before) };
  const anchor = "before" in target ? target.before : target.after;
  if (keys.includes(anchor)) {
    throw new CliError("USAGE", `${anchor} cannot be ranked relative to itself`);
  }
  return target;
}

function where(target: RankTarget): string {
  return "before" in target ? `before ${target.before}` : `after ${target.after}`;
}
