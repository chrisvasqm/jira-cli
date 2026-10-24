import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { ticketUrl } from "../render.js";
import { IssueService } from "../../services/issue.service.js";
import {
  applyAll,
  bulkOptions,
  confirmBulk,
  parseSelection,
  printBulk,
  selectedKeys,
  type BulkOptions,
} from "./bulk.js";
import {
  buildEdit,
  fieldOptions,
  hasFieldFlags,
  moveToSprint,
  readDescription,
  resolveSprint,
  type FieldOptions,
} from "./fields.js";
import {
  hasProjectFieldFlags,
  projectFieldNames,
  projectFieldOptions,
  resolveProjectFields,
  type ProjectFieldOptions,
} from "./project-fields.js";

type EditOptions = FieldOptions & ProjectFieldOptions & BulkOptions;

interface Edited {
  key: string;
  url: string;
  changed: string[];
}

export function registerEdit(ticket: Command): void {
  const edit = ticket
    .command("edit [key]")
    .description(
      "Change a ticket's fields; only the flags you pass change. A comma-separated key list or --jql changes several",
    );
  fieldOptions(edit, "edit").action(async (rawKey: string | undefined, opts: EditOptions, cmd: Command) => {
    const selection = parseSelection(rawKey, opts);
    if (opts.summary !== undefined && !opts.summary.trim())
      throw new CliError("USAGE", "--summary cannot be empty");
    const description = await readDescription(opts);
    if (!hasFieldFlags(opts, description) && !hasProjectFieldFlags(opts)) {
      throw new CliError("USAGE", "Nothing to change. Pass at least one field flag (see --help)");
    }
    const { config, mode } = bootstrap(cmd);
    const keys = await selectedKeys(selection, opts, config);
    // Resolve everything (sprint, user, components, versions) before the first write.
    const sprint = opts.sprint === undefined ? undefined : await resolveSprint(opts.sprint, config.boardId);
    const fieldsOf = hasProjectFieldFlags(opts) ? await projectFields(opts, keys) : undefined;
    const { edit: base, changed: baseChanged } = await buildEdit(opts, description);
    const apply = async (key: string): Promise<Edited> => {
      const extra = fieldsOf ? await fieldsOf(key) : {};
      const changed = [...baseChanged, ...Object.keys(extra)];
      if (changed.length > 0) {
        await new IssueService().update(key, { fields: { ...base.fields, ...extra }, update: base.update });
      }
      if (sprint !== undefined) {
        await moveToSprint(key, sprint);
        changed.push("sprint");
      }
      return { key, url: ticketUrl(config, key), changed };
    };
    if (!selection.bulk) {
      const result = await apply(selection.key);
      printResult(mode, result, () => `Updated ${result.key}: ${result.changed.join(", ")}.`);
      return;
    }
    const fields = [...baseChanged, ...projectFieldNames(opts), ...(sprint === undefined ? [] : ["sprint"])];
    await confirmBulk(keys, `Change ${fields.join(", ")}`, opts.yes);
    const result = await applyAll(keys, apply);
    printBulk(mode, result, (item) => `Updated ${item.key}: ${item.changed.join(", ")}.`);
  });
  projectFieldOptions(edit);
  bulkOptions(edit);
}

/**
 * Component and version ids for a ticket. Each ticket's project comes from Jira, not its key
 * prefix (a moved ticket keeps its old key), and every project is resolved before the first
 * write so a typo fails first. A ticket whose lookup failed is asked again, so it fails alone.
 */
async function projectFields(
  opts: ProjectFieldOptions,
  keys: string[],
): Promise<(key: string) => Promise<Record<string, unknown>>> {
  const issues = new IssueService();
  const found = await applyAll(keys, async (key) => [key, await issues.projectOf(key)] as const);
  const projectOf = new Map(found.updated);
  const listed = new Map<string, Record<string, unknown>>();
  for (const project of new Set(projectOf.values())) {
    listed.set(project, await resolveProjectFields(opts, project));
  }
  return async (key) => {
    const project = projectOf.get(key) ?? (await issues.projectOf(key));
    const fields = listed.get(project) ?? (await resolveProjectFields(opts, project));
    listed.set(project, fields);
    return fields;
  };
}
