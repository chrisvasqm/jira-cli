import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { IssueService } from "../../services/issue.service.js";

interface DeleteOptions {
  yes?: boolean;
  withSubtasks?: boolean;
}

export function registerDelete(ticket: Command): void {
  ticket
    .command("delete <key>")
    .description("Delete a ticket (asks first; --yes skips the question)")
    .option("-y, --yes", "Delete without asking")
    .option("--with-subtasks", "Also delete its sub-tasks (Jira refuses otherwise)")
    .action(async (rawKey: string, opts: DeleteOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const { mode } = bootstrap(cmd);
      const issues = new IssueService();
      if (!opts.yes) {
        const issue = await issues.get(key);
        const subtasks = opts.withSubtasks ? " and its sub-tasks" : "";
        await confirm(`Delete ${key} "${issue.fields.summary}"${subtasks}? This cannot be undone.`, opts.yes);
      }
      await issues.remove(key, opts.withSubtasks ?? false);
      printResult(mode, { key, deleted: true }, () => `Deleted ${key}.`);
    });
}
