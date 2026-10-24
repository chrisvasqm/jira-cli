import type { Command } from "commander";
import { intInRange, projectKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { summarize, type IssueSummary } from "../../core/jira-types.js";
import { quote } from "../../core/jql.js";
import { grid, printResult } from "../../core/output.js";
import { FilterService } from "../../services/filter.service.js";
import { SearchService } from "../../services/search.service.js";
import { assigneeClause } from "../board/view.js";
import { resolveSprint } from "./fields.js";

interface ListOptions {
  project?: string;
  jql?: string;
  assignee?: string;
  status?: string;
  type?: string;
  sprint?: string;
  filter?: string;
  orderBy: string;
  limit: string;
}

interface TicketList {
  jql: string;
  fetched: number;
  hasMore: boolean;
  issues: IssueSummary[];
}

const MAX_LIMIT = 1000;

export function registerList(ticket: Command): void {
  ticket
    .command("list")
    .description("Search tickets (default: not done in the configured project, latest updated first)")
    .option("-k, --project <key>", "Project key (default: projectKey from config)")
    .option("-q, --jql <query>", "Extra JQL joined with AND; also drops the default 'not done' condition")
    .option(
      "-a, --assignee <me|none|user>",
      "Only tickets assigned to me, none (unassigned), or <user> (email, name or accountId)",
    )
    .option("-st, --status <name>", "Only tickets in this status")
    .option("-t, --type <name>", "Only tickets of this type, e.g. Bug")
    .option(
      "-sp, --sprint <sprint>",
      "active, a sprint id or name (configured board), or none for tickets in no sprint",
    )
    .option("-fi, --filter <id|name>", "Start from a saved filter instead of the project")
    .option("-o, --order-by <fields>", "JQL sort", "updated DESC")
    .option("-n, --limit <n>", `Maximum tickets to fetch (1-${MAX_LIMIT})`, "50")
    .action(async (opts: ListOptions, cmd: Command) => {
      const limit = intInRange(opts.limit, "--limit", 1, MAX_LIMIT);
      const project = opts.project === undefined ? undefined : projectKey(opts.project);
      const { config, mode } = bootstrap(cmd);
      const [base, assignee, sprint] = await Promise.all([
        baseClause(opts.filter, project ?? config.projectKey, project !== undefined),
        assigneeClause(opts.assignee),
        sprintClause(opts.sprint, config.boardId),
      ]);
      const clauses = [base, assignee, sprint];
      if (opts.status) clauses.push(`status = ${quote(opts.status)}`);
      if (opts.type) clauses.push(`issuetype = ${quote(opts.type)}`);
      // With -q the caller decides which statuses to see.
      clauses.push(opts.jql ? `(${opts.jql})` : "statusCategory != Done");
      const where = clauses.filter((clause) => clause !== undefined).join(" AND ");
      const jql = `${where} ORDER BY ${opts.orderBy}`;
      const found = await new SearchService().issues(jql, limit);
      const view: TicketList = {
        jql,
        fetched: found.issues.length,
        hasMore: found.hasMore,
        issues: found.issues.map(summarize),
      };
      printResult(mode, view, () => renderHuman(view));
    });
}

/**
 * A saved filter replaces the project scope unless --project is also given.
 * `filter = <id>` keeps the filter's own ORDER BY out of the query.
 */
async function baseClause(filter: string | undefined, project: string, explicit: boolean): Promise<string> {
  const projectJql = `project = ${quote(project)}`;
  if (filter === undefined) return projectJql;
  const found = await new FilterService().resolve(filter);
  return explicit ? `filter = ${found.id} AND ${projectJql}` : `filter = ${found.id}`;
}

/** Reuses ticket create/edit's sprint resolving; "none" means tickets in no sprint. */
async function sprintClause(raw: string | undefined, boardId: number): Promise<string | undefined> {
  if (raw === undefined) return undefined;
  const target = await resolveSprint(raw, boardId);
  return target === null ? "sprint is EMPTY" : `sprint = ${target.id}`;
}

function renderHuman({ issues, fetched, hasMore }: TicketList): string {
  if (fetched === 0) return "No tickets match.";
  const rows = issues.map((issue) => [
    issue.key,
    issue.type,
    issue.status,
    issue.assignee ?? "unassigned",
    issue.summary,
  ]);
  const table = grid([["KEY", "TYPE", "STATUS", "ASSIGNEE", "SUMMARY"], ...rows]);
  return hasMore ? `${table}\n\nShowing ${fetched}. Raise --limit to see more.` : table;
}
