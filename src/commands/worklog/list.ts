import type { Command } from "commander";
import { intInRange, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult } from "../../core/output.js";
import { WorklogService } from "../../services/worklog.service.js";
import { renderWorklog, toWorklogView, type WorklogView } from "./common.js";

interface ListOptions {
  limit: string;
}

interface WorklogList {
  key: string;
  total: number;
  worklogs: WorklogView[];
}

export function registerList(worklog: Command): void {
  worklog
    .command("list <key>")
    .description("Show the time logged on a ticket, oldest first")
    .option("-n, --limit <n>", "Maximum worklogs to fetch", "50")
    .action(async (rawKey: string, opts: ListOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const limit = intInRange(opts.limit, "--limit", 1);
      const { mode } = bootstrap(cmd);
      const page = await new WorklogService().list(key, limit);
      const view: WorklogList = { key, total: page.total, worklogs: page.worklogs.map(toWorklogView) };
      printResult(mode, view, () => renderHuman(view));
    });
}

function renderHuman(view: WorklogList): string {
  if (view.total === 0) return `${view.key} has no time logged.`;
  const shown = view.worklogs.length;
  const heading =
    shown < view.total
      ? `${view.key} worklogs (first ${shown} of ${view.total})`
      : `${view.key} worklogs (${view.total})`;
  const body = [heading, ...view.worklogs.map(renderWorklog)].join("\n\n");
  return shown < view.total ? `${body}\n\nRaise --limit to see more.` : body;
}
