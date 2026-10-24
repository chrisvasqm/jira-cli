import type { Command } from "commander";
import { projectKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, printResult } from "../../core/output.js";
import { ProjectService } from "../../services/project.service.js";

interface ListOptions {
  project?: string;
}

interface VersionItem {
  id: string;
  name: string;
  released: boolean;
  archived: boolean;
  /** "2026-10-24", as Jira stores it. */
  releaseDate: string | null;
}

export function registerList(version: Command): void {
  version
    .command("list")
    .description("List a project's versions, unreleased first")
    .option("-k, --project <key>", "Project key (default: projectKey from config)")
    .action(async (opts: ListOptions, cmd: Command) => {
      const wanted = opts.project === undefined ? undefined : projectKey(opts.project);
      const { config, mode } = bootstrap(cmd);
      const project = wanted ?? config.projectKey;
      const found = await new ProjectService().versions(project);
      const all: VersionItem[] = found.map((item) => ({
        id: item.id,
        name: item.name,
        released: item.released ?? false,
        archived: item.archived ?? false,
        releaseDate: item.releaseDate ?? null,
      }));
      // Stable sort: each group keeps the project's own version order.
      const versions = all.toSorted((left, right) => Number(left.released) - Number(right.released));
      printResult(mode, { project, versions }, () =>
        versions.length === 0
          ? `${project} has no versions.`
          : grid([
              ["ID", "NAME", "STATE", "RELEASE DATE"],
              ...versions.map((item) => [item.id, item.name, state(item), item.releaseDate ?? ""]),
            ]),
      );
    });
}

function state(item: VersionItem): string {
  const base = item.released ? "released" : "unreleased";
  return item.archived ? `${base}, archived` : base;
}
