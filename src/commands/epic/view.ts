import type { Command } from "commander";
import { intInRange, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { summarize } from "../../core/jira-types.js";
import { grid, printResult, table } from "../../core/output.js";
import { ticketUrl } from "../render.js";
import { EpicService, progressOf, type Progress } from "../../services/epic.service.js";

interface ViewOptions {
  limit: string;
}

interface Child {
  key: string;
  type: string;
  summary: string;
  status: string;
  statusCategory: string | null;
  assignee: string | null;
}

interface EpicView {
  key: string;
  summary: string;
  status: string;
  statusCategory: string | null;
  assignee: string | null;
  url: string;
  /** Over every child; null when the epic has more than MAX_CHILDREN. */
  progress: Progress | null;
  /** More children exist than `children` shows. */
  hasMore: boolean;
  children: Child[];
}

/** Children read to count progress; --limit only cuts what is shown. */
const MAX_CHILDREN = 1000;

export function registerView(epic: Command): void {
  epic
    .command("view <key>")
    .description("An epic, its child tickets and progress (done = status category done)")
    .option("-n, --limit <n>", `Maximum child tickets to show (0-${MAX_CHILDREN})`, "50")
    .action(async (rawKey: string, opts: ViewOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const limit = intInRange(opts.limit, "--limit", 0, MAX_CHILDREN);
      const { config, mode } = bootstrap(cmd);
      const service = new EpicService();
      const issue = await service.get(key);
      const found = await service.children([issue.key], MAX_CHILDREN);
      const children = found.issues.map(summarize);
      const { summary, status, statusCategory, assignee } = summarize(issue);
      const view: EpicView = {
        key: issue.key,
        summary,
        status,
        statusCategory,
        assignee,
        url: ticketUrl(config, issue.key),
        progress: found.hasMore ? null : progressOf(found.issues),
        hasMore: found.hasMore || children.length > limit,
        children: children.slice(0, limit).map((child) => ({
          key: child.key,
          type: child.type,
          summary: child.summary,
          status: child.status,
          statusCategory: child.statusCategory,
          assignee: child.assignee,
        })),
      };
      printResult(mode, view, () => renderHuman(view));
    });
}

/** "3/5 done", "no children", or "?" when not counted. */
export function progressText(progress: Progress | null): string {
  if (progress === null) return "?";
  return progress.total === 0 ? "no children" : `${progress.done}/${progress.total} done`;
}

function renderHuman(view: EpicView): string {
  const progress =
    view.progress === null ? `over ${MAX_CHILDREN} tickets, not counted` : progressText(view.progress);
  const sections = [
    `${view.key}  ${view.summary}`,
    table([
      ["Status", view.status],
      ["Assignee", view.assignee ?? "unassigned"],
      ["Progress", progress],
      ["URL", view.url],
    ]),
  ];
  if (view.children.length > 0) {
    const rows = view.children.map((child) => [
      child.key,
      child.type,
      child.status,
      child.assignee ?? "unassigned",
      child.summary,
    ]);
    sections.push(grid([["KEY", "TYPE", "STATUS", "ASSIGNEE", "SUMMARY"], ...rows]));
  }
  if (view.hasMore) sections.push(`Showing ${view.children.length} tickets. Raise --limit to see more.`);
  return sections.join("\n\n");
}
