import type { Command } from "commander";
import { CliError } from "../../core/errors.js";
import { sameName } from "../../core/text.js";
import { ProjectService } from "../../services/project.service.js";

/** `--component` and `--fix-version` on `ticket create` and `ticket edit`. */
export interface ProjectFieldOptions {
  component?: string;
  fixVersion?: string;
}

export function projectFieldOptions(cmd: Command): Command {
  return cmd
    .option(
      "-co, --component <names>",
      'Components, comma-separated; sets the whole list ("" clears on edit)',
    )
    .option(
      "-fv, --fix-version <names>",
      'Fix versions, comma-separated; sets the whole list ("" clears on edit)',
    );
}

export function hasProjectFieldFlags(opts: ProjectFieldOptions): boolean {
  return opts.component !== undefined || opts.fixVersion !== undefined;
}

/** "a, b,,c" → ["a", "b", "c"]; "" → [] (clear). */
function names(raw: string): string[] {
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/**
 * Jira `fields` for the flags passed, with names resolved to ids in `project` before
 * anything is written, so a typo fails first. An empty list clears the field.
 */
export async function resolveProjectFields(
  opts: ProjectFieldOptions,
  project: string,
): Promise<Record<string, { id: string }[]>> {
  const fields: Record<string, { id: string }[]> = {};
  const projects = new ProjectService();
  if (opts.component !== undefined) {
    const wanted = names(opts.component);
    const available = wanted.length > 0 ? await projects.components(project) : [];
    fields["components"] = match(wanted, available, "COMPONENT_NOT_FOUND", `components of ${project}`);
  }
  if (opts.fixVersion !== undefined) {
    const wanted = names(opts.fixVersion);
    const available = wanted.length > 0 ? await projects.versions(project) : [];
    fields["fixVersions"] = match(wanted, available, "VERSION_NOT_FOUND", `versions of ${project}`);
  }
  return fields;
}

/** Ids of the wanted names, ignoring case; every unknown name is reported at once. */
function match(
  wanted: string[],
  available: { id: string; name: string }[],
  code: string,
  what: string,
): { id: string }[] {
  const found = wanted.map((name) => available.find((item) => sameName(item.name, name)));
  const unknown = wanted.filter((_, index) => found[index] === undefined);
  if (unknown.length > 0) {
    const list = unknown.map((name) => `"${name}"`).join(", ");
    throw new CliError(
      code,
      `Not among the ${what}: ${list}`,
      available.map((item) => item.name),
    );
  }
  return found.flatMap((item) => (item ? [{ id: item.id }] : []));
}
