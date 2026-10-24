import type { Command } from "commander";
import { textToAdf } from "../../core/adf.js";
import { readText } from "../../core/input.js";
import type { IssueEdit } from "../../services/issue.service.js";
import { UserService } from "../../services/user.service.js";

/** Field flags shared by `ticket create` and `ticket edit`. */
export interface FieldOptions {
  summary?: string;
  description?: string;
  descriptionFile?: string;
  priority?: string;
  assignee?: string;
  addLabel?: string[];
  removeLabel?: string[];
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

/** `--remove-label` only exists on edit: a new ticket has no labels to remove. */
export function fieldOptions(cmd: Command, use: "create" | "edit"): Command {
  cmd
    .option("--summary <text>", "Title")
    .option("--description <text>", "Description. Blank lines split paragraphs; ``` fences make code blocks")
    .option("--description-file <path>", "Read the description from a file (- reads stdin)")
    .option("--priority <name>", "Priority name, e.g. High")
    .option("--assignee <who>", "me, none, an email, a name or an accountId")
    .option("--add-label <label>", "Add a label (repeat for more)", collect);
  if (use === "edit") cmd.option("--remove-label <label>", "Remove a label (repeat for more)", collect);
  return cmd;
}

/**
 * Read text inputs before any network call, so usage errors come first.
 * `--description ""` returns "", which edit uses to clear the description.
 */
export async function readDescription(opts: FieldOptions): Promise<string | undefined> {
  if (opts.description === undefined && opts.descriptionFile === undefined) return undefined;
  if (opts.description === "" && opts.descriptionFile === undefined) return "";
  return readText(opts.description, opts.descriptionFile, "description");
}

export function hasFieldFlags(opts: FieldOptions, description: string | undefined): boolean {
  const values = [opts.summary, description, opts.priority, opts.assignee];
  return (
    values.some((value) => value !== undefined) ||
    (opts.addLabel?.length ?? 0) + (opts.removeLabel?.length ?? 0) > 0
  );
}

/** Build the Jira edit payload and the list of field names it changes. */
export async function buildEdit(
  opts: FieldOptions,
  description: string | undefined,
): Promise<{ edit: IssueEdit; changed: string[] }> {
  const fields: Record<string, unknown> = {};
  const update: Record<string, unknown[]> = {};
  if (opts.summary !== undefined) fields["summary"] = opts.summary;
  if (description !== undefined) fields["description"] = description === "" ? null : textToAdf(description);
  if (opts.priority !== undefined) fields["priority"] = { name: opts.priority };
  if (opts.assignee !== undefined) fields["assignee"] = await assignee(opts.assignee);
  const labels = [
    ...(opts.addLabel ?? []).map((label) => ({ add: label })),
    ...(opts.removeLabel ?? []).map((label) => ({ remove: label })),
  ];
  if (labels.length > 0) update["labels"] = labels;
  return { edit: { fields, update }, changed: [...Object.keys(fields), ...Object.keys(update)] };
}

async function assignee(who: string): Promise<{ accountId: string } | null> {
  if (who === "none") return null;
  const user = await new UserService().resolve(who);
  return { accountId: user.accountId };
}
