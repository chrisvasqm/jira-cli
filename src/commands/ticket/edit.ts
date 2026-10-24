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
    const listed = hasProjectFieldFlags(opts)
      ? await projectFields(opts, keys, selection.bulk)
      : new Map<string, Record<string, unknown>>();
    const { edit: base, changed: baseChanged } = await buildEdit(opts, description);
    const apply = async (key: string): Promise<Edited> => {
      const extra = listed.get(projectOfKey(key)) ?? {};
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
    const [someFields = {}] = listed.values();
    const fields = [...baseChanged, ...Object.keys(someFields), ...(sprint === undefined ? [] : ["sprint"])];
    await confirmBulk(keys, `Change ${fields.join(", ")}`, opts.yes);
    const result = await applyAll(keys, apply);
    printBulk(mode, result, (item) => `Updated ${item.key}: ${item.changed.join(", ")}.`);
  });
  projectFieldOptions(edit);
  bulkOptions(edit);
}

/** "KAN-12" → "KAN". */
function projectOfKey(key: string): string {
  return key.slice(0, key.lastIndexOf("-"));
}

/**
 * Component and version ids for each project, keyed by project key. One ticket asks Jira
 * for its project (as before); several use their key prefix, so one lookup serves many.
 */
async function projectFields(
  opts: ProjectFieldOptions,
  keys: string[],
  bulk: boolean,
): Promise<Map<string, Record<string, unknown>>> {
  const [first = ""] = keys;
  const projects = bulk
    ? new Set(keys.map(projectOfKey))
    : new Set([await new IssueService().projectOf(first)]);
  const listed = new Map<string, Record<string, unknown>>();
  for (const project of projects) listed.set(project, await resolveProjectFields(opts, project));
  // A single ticket may have moved project: its fields belong to its key whatever the prefix.
  if (!bulk) listed.set(projectOfKey(first), [...listed.values()][0] ?? {});
  return listed;
}
