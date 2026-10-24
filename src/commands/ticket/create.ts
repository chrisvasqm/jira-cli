import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { ticketUrl } from "../render.js";
import { IssueService } from "../../services/issue.service.js";
import { buildEdit, fieldOptions, readDescription, type FieldOptions } from "./fields.js";

interface CreateOptions extends FieldOptions {
  type: string;
  parent?: string;
  project?: string;
}

export function registerCreate(ticket: Command): void {
  const create = ticket
    .command("create")
    .description("Create a ticket in the configured project")
    .option("--type <name>", "Issue type, e.g. Task, Bug, Story", "Task")
    .option("--parent <key>", "Parent ticket (epic, or the story of a sub-task)")
    .option("--project <key>", "Project key (default: projectKey from config)");
  fieldOptions(create).action(async (opts: CreateOptions, cmd: Command) => {
    if (!opts.summary?.trim()) throw new CliError("USAGE", "--summary is required");
    if (opts.removeLabel?.length) throw new CliError("USAGE", "--remove-label only works with ticket edit");
    const parent = opts.parent === undefined ? undefined : issueKey(opts.parent);
    // An empty description on create means none, not "clear".
    const description = (await readDescription(opts)) || undefined;
    const { config, mode } = bootstrap(cmd);
    const { edit } = await buildEdit(opts, description);
    edit.fields["project"] = { key: (opts.project ?? config.projectKey).toUpperCase() };
    edit.fields["issuetype"] = { name: opts.type };
    if (parent) edit.fields["parent"] = { key: parent };
    const created = await new IssueService().create(edit);
    const result = { key: created.key, id: created.id, url: ticketUrl(config, created.key) };
    printResult(mode, result, () => `Created ${result.key}: ${result.url}`);
  });
}
