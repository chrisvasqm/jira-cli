import type { Command } from "commander";
import { intInRange, projectKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { summarize, type Issue } from "../../core/jira-types.js";
import { quote } from "../../core/jql.js";
import { grid, printResult } from "../../core/output.js";
import { EpicService, progressOf, type ChildIssue, type Progress } from "../../services/epic.service.js";
import { SearchService } from "../../services/search.service.js";
import { progressText } from "./view.js";

interface ListOptions {
  project?: string;
  status?: string;
  limit: string;
}

interface EpicRow {
  key: string;
  summary: string;
  status: string;
  statusCategory: string | null;
  assignee: string | null;
  updated: string;
  /** null when the epics have more children than one count reads. */
  progress: Progress | null;
}

interface EpicList {
  jql: string;
  fetched: number;
  hasMore: boolean;
  epics: EpicRow[];
}

const MAX_LIMIT = 100;
/** Children read in one search to count progress for every listed epic. */
const MAX_CHILDREN = 1000;

export function registerList(epic: Command): void {
  epic
    .command("list")
    .description("Epics in the project with their progress (default: not done, latest updated first)")
    .option("-k, --project <key>", "Project key (default: projectKey from config)")
    .option("-st, --status <name>", "Only epics in this status; also drops the default 'not done' condition")
    .option("-n, --limit <n>", `Maximum epics to fetch (1-${MAX_LIMIT})`, "50")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = intInRange(opts.limit, "--limit", 1, MAX_LIMIT);
      const project = opts.project === undefined ? undefined : projectKey(opts.project);
      const { config, mode } = bootstrap(cmd);
      const status = opts.status ? `status = ${quote(opts.status)}` : "statusCategory != Done";
      const key = project ?? config.projectKey;
      const epics = new EpicService();
      const types = await epics.typeIds(key);
      const jql = `project = ${quote(key)} AND issuetype in (${types.join(", ")}) AND ${status} ORDER BY updated DESC`;
      const found =
        types.length === 0 ? { issues: [], hasMore: false } : await new SearchService().issues(jql, limit);
      const children = await epics.children(
        found.issues.map((issue) => issue.key),
        MAX_CHILDREN,
      );
      const view: EpicList = {
        jql,
        fetched: found.issues.length,
        hasMore: found.hasMore,
        epics: found.issues.map((issue) => toRow(issue, children.hasMore ? null : children.issues)),
      };
      printResult(mode, view, () => renderHuman(view, children.hasMore));
    });
}

function toRow(issue: Issue, children: ChildIssue[] | null): EpicRow {
  const { key, summary, status, statusCategory, assignee, updated } = summarize(issue);
  const own = children?.filter((child) => child.fields.parent?.key === key);
  return { key, summary, status, statusCategory, assignee, updated, progress: own ? progressOf(own) : null };
}

function renderHuman({ epics, fetched, hasMore }: EpicList, uncounted: boolean): string {
  if (fetched === 0) return "No epics match.";
  const rows = epics.map((epic) => [
    epic.key,
    epic.status,
    progressText(epic.progress),
    epic.assignee ?? "unassigned",
    epic.summary,
  ]);
  const notes = [grid([["KEY", "STATUS", "PROGRESS", "ASSIGNEE", "SUMMARY"], ...rows])];
  if (uncounted)
    notes.push(`These epics have over ${MAX_CHILDREN} tickets; run jira epic view <KEY> for progress.`);
  if (hasMore) notes.push(`Showing ${fetched}. Raise --limit to see more.`);
  return notes.join("\n\n");
}
