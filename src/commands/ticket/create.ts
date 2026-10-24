import type { Command } from "commander";
import { issueKey, projectKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { ticketUrl } from "../render.js";
import { IssueService } from "../../services/issue.service.js";
import {
  buildEdit,
  fieldOptions,
  moveToSprint,
  readDescription,
  resolveSprint,
  type FieldOptions,
  type SprintTarget,
} from "./fields.js";

/** The ticket exists by now, so a failure here must say so: retrying create would duplicate it. */
async function addCreated(key: string, sprint: NonNullable<SprintTarget>): Promise<void> {
  await moveToSprint(key, sprint).catch((err: unknown) => {
    const reason = err instanceof Error ? err.message : String(err);
    const code = err instanceof CliError ? err.code : "UNEXPECTED";
    throw new CliError(code, `Created ${key}, but could not add it to sprint ${sprint.name}: ${reason}`, {
      key,
    });
  });
}

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
  fieldOptions(create, "create").action(async (opts: CreateOptions, cmd: Command) => {
    if (!opts.summary?.trim()) throw new CliError("USAGE", "--summary is required");
    const parent = opts.parent === undefined ? undefined : issueKey(opts.parent);
    const project = opts.project === undefined ? undefined : projectKey(opts.project);
    // An empty description on create means none, not "clear".
    const description = (await readDescription(opts)) || undefined;
    const { config, mode } = bootstrap(cmd);
    const sprint = opts.sprint === undefined ? undefined : await resolveSprint(opts.sprint, config.boardId);
    const { edit } = await buildEdit(opts, description);
    edit.fields["project"] = { key: project ?? config.projectKey };
    edit.fields["issuetype"] = { name: opts.type };
    if (parent) edit.fields["parent"] = { key: parent };
    const created = await new IssueService().create(edit);
    const result = {
      key: created.key,
      id: created.id,
      url: ticketUrl(config, created.key),
      sprint: sprint ?? null,
    };
    if (sprint) await addCreated(created.key, sprint);
    const where = sprint ? ` in sprint ${sprint.name}` : "";
    printResult(mode, result, () => `Created ${result.key}${where}: ${result.url}`);
  });
}
