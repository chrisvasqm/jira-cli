import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { FilterService } from "../../services/filter.service.js";

interface ListOptions {
  limit: string;
}

interface FilterItem {
  id: string;
  name: string;
  owner: string | null;
  favourite: boolean;
  jql: string;
}

interface FilterList {
  total: number;
  filters: FilterItem[];
}

export function registerList(filter: Command): void {
  filter
    .command("list", { isDefault: true })
    .description("Saved filters you own or marked as favourite")
    .option("-n, --limit <n>", "Maximum filters to show", "50")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = intInRange(opts.limit, "--limit", 1);
      const { mode } = bootstrap(cmd);
      const all = await new FilterService().mine();
      const view: FilterList = {
        total: all.length,
        filters: all.slice(0, limit).map((item) => ({
          id: item.id,
          name: item.name,
          owner: item.owner?.displayName ?? null,
          favourite: item.favourite ?? false,
          jql: item.jql,
        })),
      };
      printResult(mode, view, () => renderHuman(view));
    });
}

function renderHuman({ total, filters }: FilterList): string {
  if (filters.length === 0) return "You have no saved or favourite filters.";
  const width = Math.max(...filters.map((item) => item.id.length));
  const blocks = filters.map((item) => {
    const star = item.favourite ? " *" : "";
    const head = `${item.id.padStart(width)}  ${item.name}${star}  [${item.owner ?? "unknown owner"}]`;
    return `${head}\n${" ".repeat(width + 2)}${item.jql}`;
  });
  const more =
    filters.length < total ? `\nShowing ${filters.length} of ${total}. Raise --limit to see more.` : "";
  return `${blocks.join("\n")}\n${more}\n* favourite. Use a filter with: jira ticket list -fi <id|name>`;
}
