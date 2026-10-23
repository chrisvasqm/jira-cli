import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { IssueService } from "../../services/issue.service.js";
import { buildEdit, fieldOptions, hasFieldFlags, readDescription, type FieldOptions } from "./fields.js";

export function registerEdit(ticket: Command): void {
  const edit = ticket
    .command("edit <key>")
    .description("Change a ticket's fields; only the flags you pass change");
  fieldOptions(edit).action(async (rawKey: string, opts: FieldOptions, cmd: Command) => {
    const key = issueKey(rawKey);
    const description = await readDescription(opts);
    if (opts.summary !== undefined && !opts.summary.trim())
      throw new CliError("USAGE", "--summary cannot be empty");
    if (!hasFieldFlags(opts, description)) {
      throw new CliError("USAGE", "Nothing to change. Pass at least one field flag (see --help)");
    }
    const { config, mode } = bootstrap(cmd);
    const { edit: payload, changed } = await buildEdit(opts, description);
    await new IssueService().update(key, payload);
    const result = { key, url: `${config.baseUrl}/browse/${key}`, changed };
    printResult(mode, result, () => `Updated ${key}: ${changed.join(", ")}.`);
  });
}
