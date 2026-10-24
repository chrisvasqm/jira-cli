import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { ticketUrl } from "../render.js";
import { IssueService } from "../../services/issue.service.js";
import {
  buildEdit,
  fieldOptions,
  hasFieldFlags,
  moveToSprint,
  readDescription,
  resolveSprint,
  type FieldOptions,
} from "./fields.js";

export function registerEdit(ticket: Command): void {
  const edit = ticket
    .command("edit <key>")
    .description("Change a ticket's fields; only the flags you pass change");
  fieldOptions(edit, "edit").action(async (rawKey: string, opts: FieldOptions, cmd: Command) => {
    const key = issueKey(rawKey);
    if (opts.summary !== undefined && !opts.summary.trim())
      throw new CliError("USAGE", "--summary cannot be empty");
    const description = await readDescription(opts);
    if (!hasFieldFlags(opts, description)) {
      throw new CliError("USAGE", "Nothing to change. Pass at least one field flag (see --help)");
    }
    const { config, mode } = bootstrap(cmd);
    const sprint = opts.sprint === undefined ? undefined : await resolveSprint(opts.sprint, config.boardId);
    const { edit: payload, changed } = await buildEdit(opts, description);
    if (changed.length > 0) await new IssueService().update(key, payload);
    if (sprint !== undefined) {
      await moveToSprint(key, sprint);
      changed.push("sprint");
    }
    const result = { key, url: ticketUrl(config, key), changed };
    printResult(mode, result, () => `Updated ${key}: ${changed.join(", ")}.`);
  });
}
