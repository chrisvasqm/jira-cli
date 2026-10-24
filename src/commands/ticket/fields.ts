import type { Command } from "commander";
import { textToAdf } from "../../core/adf.js";
import { CliError } from "../../core/errors.js";
import { duration } from "../../core/args.js";
import { readText } from "../../core/input.js";
import { sameName } from "../../core/text.js";
import { BoardService, onlyActive } from "../../services/board.service.js";
import type { IssueEdit } from "../../services/issue.service.js";
import { SprintService } from "../../services/sprint.service.js";
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
  sprint?: string;
  /** Jira durations, already checked by `duration` while parsing. */
  estimate?: string;
  remaining?: string;
}

/** Where `--sprint` puts the ticket: a sprint, or null for the backlog. */
export type SprintTarget = { id: number; name: string } | null;

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

/** `--remove-label` only exists on edit: a new ticket has no labels to remove. */
export function fieldOptions(cmd: Command, use: "create" | "edit"): Command {
  cmd
    .option("-s, --summary <text>", "Title")
    .option(
      "-d, --description <text>",
      "Description. Blank lines split paragraphs; ``` fences make code blocks",
    )
    .option("-f, --description-file <path>", "Read the description from a file (- reads stdin)")
    .option("-p, --priority <name>", "Priority name, e.g. High")
    .option("-a, --assignee <who>", "me, none, an email, a name or an accountId")
    .option("-l, --add-label <label>", "Add a label (repeat for more)", collect)
    .option(
      "-sp, --sprint <sprint>",
      "active, a sprint id or name, or none for the backlog (configured board)",
    )
    .option("-es, --estimate <duration>", "Original estimate, e.g. 2h30m or 1d", (raw: string) =>
      duration(raw, "--estimate"),
    )
    .option("-re, --remaining <duration>", "Remaining estimate, e.g. 4h", (raw: string) =>
      duration(raw, "--remaining"),
    );
  if (use === "edit") cmd.option("-rl, --remove-label <label>", "Remove a label (repeat for more)", collect);
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
  const values = [
    opts.summary,
    description,
    opts.priority,
    opts.assignee,
    opts.sprint,
    opts.estimate,
    opts.remaining,
  ];
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
  const timetracking = { originalEstimate: opts.estimate, remainingEstimate: opts.remaining };
  if (opts.estimate !== undefined || opts.remaining !== undefined) fields["timetracking"] = timetracking;
  return { edit: { fields, update }, changed: [...Object.keys(fields), ...Object.keys(update)] };
}

/**
 * Resolve `--sprint` on the configured board before anything is written, so a typo
 * fails before a ticket is created or changed.
 */
export async function resolveSprint(raw: string, boardId: number): Promise<SprintTarget> {
  const wanted = raw.trim();
  // The keywords ignore case, like sprint names do.
  const keyword = wanted.toLowerCase();
  if (keyword === "none") return null;
  if (/^\d+$/.test(wanted)) {
    const sprint = await new SprintService().get(Number(wanted));
    return { id: sprint.id, name: sprint.name };
  }
  const sprints = await new BoardService().sprints(
    boardId,
    keyword === "active" ? "active" : "active,future",
  );
  if (sprints === undefined) throw new CliError("NO_SPRINTS", `Board ${boardId} does not use sprints.`);
  if (keyword === "active") {
    const active = onlyActive(boardId, sprints);
    if (!active) throw new CliError("NO_ACTIVE_SPRINT", `Board ${boardId} has no active sprint.`);
    return { id: active.id, name: active.name };
  }
  const matches = sprints.filter((sprint) => sameName(sprint.name, wanted));
  const [match, ...others] = matches;
  const options = sprints.map((sprint) => ({ id: sprint.id, name: sprint.name, state: sprint.state }));
  if (match && others.length === 0) return { id: match.id, name: match.name };
  if (!match) {
    throw new CliError("SPRINT_NOT_FOUND", `No open sprint named "${wanted}" on board ${boardId}.`, options);
  }
  throw new CliError(
    "SPRINT_AMBIGUOUS",
    `"${wanted}" matches ${matches.length} sprints; pass a sprint id.`,
    options,
  );
}

/** Put the ticket in the sprint, or back in the backlog for null. */
export async function moveToSprint(key: string, target: SprintTarget): Promise<void> {
  const sprints = new SprintService();
  await (target === null ? sprints.toBacklog(key) : sprints.add(target.id, key));
}

async function assignee(who: string): Promise<{ accountId: string } | null> {
  if (who === "none") return null;
  const user = await new UserService().resolve(who);
  return { accountId: user.accountId };
}
