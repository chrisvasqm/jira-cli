import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { LabelService } from "../../services/label.service.js";

interface ListOptions {
  limit: string;
}

export function registerList(label: Command): void {
  label
    .command("list")
    .description("List the labels used anywhere on the site")
    .option("-n, --limit <n>", "Maximum labels to fetch", "1000")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = intInRange(opts.limit, "--limit", 1);
      const { mode } = bootstrap(cmd);
      const found = await new LabelService().list(limit);
      const view = { total: found.total, hasMore: found.hasMore, labels: found.items };
      printResult(mode, view, () => {
        if (view.labels.length === 0) return "No labels.";
        const body = view.labels.join("\n");
        return view.hasMore ? `${body}\n\nRaise --limit to see more.` : body;
      });
    });
}
