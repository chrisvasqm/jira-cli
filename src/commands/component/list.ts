import type { Command } from "commander";
import { projectKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, printResult } from "../../core/output.js";
import { ProjectService } from "../../services/project.service.js";

interface ListOptions {
  project?: string;
}

interface ComponentItem {
  id: string;
  name: string;
  lead: string | null;
  description: string | null;
}

export function registerList(component: Command): void {
  component
    .command("list")
    .description("List a project's components")
    .option("-k, --project <key>", "Project key (default: projectKey from config)")
    .action(async (opts: ListOptions, cmd: Command) => {
      const wanted = opts.project === undefined ? undefined : projectKey(opts.project);
      const { config, mode } = bootstrap(cmd);
      const project = wanted ?? config.projectKey;
      const found = await new ProjectService().components(project);
      const components: ComponentItem[] = found.map((item) => ({
        id: item.id,
        name: item.name,
        lead: item.lead?.displayName ?? null,
        description: item.description || null,
      }));
      printResult(mode, { project, components }, () =>
        components.length === 0
          ? `${project} has no components.`
          : grid([
              ["ID", "NAME", "LEAD", "DESCRIPTION"],
              ...components.map((item) => [
                item.id,
                item.name,
                item.lead ?? "",
                (item.description ?? "").replace(/\s+/g, " "),
              ]),
            ]),
      );
    });
}
