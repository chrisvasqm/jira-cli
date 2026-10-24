import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, printResult } from "../../core/output.js";
import { ProjectService } from "../../services/project.service.js";

interface ListOptions {
  limit: string;
}

interface ProjectListItem {
  id: string;
  key: string;
  name: string;
  type: string | null;
  lead: string | null;
  current: boolean;
}

interface ProjectList {
  total: number | null;
  hasMore: boolean;
  projects: ProjectListItem[];
}

export function registerList(project: Command): void {
  project
    .command("list")
    .description("List the projects you can see; * marks the configured one")
    .option("-n, --limit <n>", "Maximum projects to fetch", "50")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = intInRange(opts.limit, "--limit", 1);
      const { config, mode } = bootstrap(cmd);
      const found = await new ProjectService().search(limit);
      const view: ProjectList = {
        total: found.total,
        hasMore: found.hasMore,
        projects: found.items.map((item) => ({
          id: item.id,
          key: item.key,
          name: item.name,
          type: item.projectTypeKey ?? null,
          lead: item.lead?.displayName ?? null,
          current: item.key === config.projectKey,
        })),
      };
      printResult(mode, view, () => renderHuman(view));
    });
}

function renderHuman(view: ProjectList): string {
  if (view.projects.length === 0) return "No projects found.";
  const rows = view.projects.map((item) => [
    item.current ? "*" : " ",
    item.key,
    item.name,
    item.type ?? "",
    item.lead ?? "no lead",
  ]);
  const body = grid([["", "KEY", "NAME", "TYPE", "LEAD"], ...rows]);
  return view.hasMore ? `${body}\n\nRaise --limit to see more.` : body;
}
