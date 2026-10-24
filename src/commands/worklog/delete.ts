import type { Command } from "commander";
import { issueKey, worklogId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { WorklogService } from "../../services/worklog.service.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(worklog: Command): void {
  worklog
    .command("delete <key> <id>")
    .description("Delete a worklog (asks first; --yes skips the question)")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawKey: string, rawId: string, opts: DeleteOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const id = worklogId(rawId);
      const { mode } = bootstrap(cmd);
      if (!opts.yes) await confirm(`Delete worklog #${id} on ${key}? This cannot be undone.`);
      await new WorklogService().remove(key, id);
      printResult(mode, { key, id, deleted: true }, () => `Deleted worklog #${id} on ${key}.`);
    });
}
