import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { daysBetween, percentile, weekOf } from "../../core/metrics.js";
import { grid, printResult, table } from "../../core/output.js";
import { SearchService, type SearchIssue } from "../../services/search.service.js";
import { localTime } from "../render.js";
import { boardJql, plural, reportContext, type ReportOptions } from "./common.js";

interface FlowOptions extends ReportOptions {
  days: string;
  limit: string;
}

interface Spread {
  median: number | null;
  p85: number | null;
  count: number;
}

interface Flow {
  boardId: number;
  days: number;
  done: number;
  hasMore: boolean;
  /** Days from first "in progress" status to done. */
  cycleTime: Spread;
  /** Days from created to done. */
  leadTime: Spread;
  throughput: { week: string; done: number }[];
  oldestOpen: { key: string; summary: string; status: string; ageDays: number }[];
}

export function registerFlow(report: Command): void {
  report
    .command("flow")
    .description("Throughput per week, cycle and lead time, and the oldest open tickets")
    .option("-b, --board <id>", "Board id (default: the configured board)")
    .option("-d, --days <n>", "How far back to look", "30")
    .option("-n, --limit <n>", "Maximum finished tickets to read", "1000")
    .action(async (opts: FlowOptions, cmd: Command) => {
      const days = intInRange(opts.days, "--days", 1, 3650);
      const limit = intInRange(opts.limit, "--limit", 1);
      const ctx = await reportContext(opts, cmd);
      const base = boardJql(ctx);
      const search = new SearchService();
      const [categories, done, open] = await Promise.all([
        search.statusCategories(),
        search.search(
          `${base} AND statusCategory = Done AND statusCategoryChangedDate >= -${days}d`,
          ["created", "statuscategorychangedate"],
          { limit, changelog: true },
        ),
        search.search(
          `${base} AND statusCategory != Done ORDER BY created ASC`,
          ["summary", "status", "created"],
          {
            limit: 5,
          },
        ),
      ]);
      const timings = done.issues.map((issue) => timing(issue, categories));
      const cycle = timings.flatMap((item) => (item.cycle === null ? [] : [item.cycle]));
      const lead = timings.flatMap((item) => (item.lead === null ? [] : [item.lead]));
      const now = new Date().toISOString();
      const view: Flow = {
        boardId: ctx.boardId,
        days,
        done: done.issues.length,
        hasMore: done.hasMore,
        cycleTime: spread(cycle),
        leadTime: spread(lead),
        throughput: weeks(days, now).map((week) => ({
          week,
          done: timings.filter((item) => item.end !== null && weekOf(item.end) === week).length,
        })),
        oldestOpen: open.issues.map((issue) => ({
          key: issue.key,
          summary: issue.fields.summary ?? "",
          status: issue.fields.status?.name ?? "Unknown",
          ageDays: issue.fields.created ? daysBetween(issue.fields.created, now) : 0,
        })),
      };
      printResult(ctx.mode, view, () => renderHuman(view));
    });
}

/** When work started (first move to an "in progress" status) and ended (last move to done). */
function timing(issue: SearchIssue, categories: Map<string, string>) {
  const moves = (issue.changelog?.histories ?? [])
    .flatMap((history) =>
      history.items
        .filter((item) => item.field === "status" && item.to !== null)
        .map((item) => ({ at: history.created, category: categories.get(item.to ?? "") })),
    )
    .toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const start = moves.find((move) => move.category === "indeterminate")?.at ?? null;
  const end =
    moves.findLast((move) => move.category === "done")?.at ?? issue.fields.statuscategorychangedate ?? null;
  const created = issue.fields.created ?? null;
  return {
    end,
    cycle: start && end ? daysBetween(start, end) : null,
    lead: created && end ? daysBetween(created, end) : null,
  };
}

function spread(values: number[]): Spread {
  return { median: percentile(values, 50), p85: percentile(values, 85), count: values.length };
}

/** Week starts (Mondays) covering the last `days` days, oldest first. */
function weeks(days: number, now: string): string[] {
  const result: string[] = [];
  const first = weekOf(new Date(Date.parse(now) - days * 86_400_000).toISOString());
  for (let week = first; week <= weekOf(now); week = nextWeek(week)) result.push(week);
  return result;
}

function nextWeek(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

function inDays(value: number | null): string {
  return value === null ? "n/a" : `${value} d`;
}

function renderHuman(view: Flow): string {
  const summary = table([
    [
      "Finished",
      `${plural(view.done, "ticket")} in the last ${view.days} days${view.hasMore ? " (more exist; raise --limit)" : ""}`,
    ],
    [
      "Cycle time",
      `median ${inDays(view.cycleTime.median)}, 85% within ${inDays(view.cycleTime.p85)} (${plural(view.cycleTime.count, "ticket")})`,
    ],
    ["Lead time", `median ${inDays(view.leadTime.median)}, 85% within ${inDays(view.leadTime.p85)}`],
  ]);
  const throughput = grid([
    ["Week of", "Done"],
    ...view.throughput.map((row) => [row.week, String(row.done)]),
  ]);
  const sections = [`Flow on board ${view.boardId}`, summary, `Throughput\n\n${throughput}`];
  if (view.oldestOpen.length > 0) {
    const rows = view.oldestOpen.map((item) => [item.key, `${item.ageDays} d`, item.status, item.summary]);
    sections.push(`Oldest open tickets\n\n${grid([["Key", "Age", "Status", "Summary"], ...rows])}`);
  }
  sections.push(
    `Cycle time runs from the first "in progress" status to done. Times as of ${localTime(new Date().toISOString())}.`,
  );
  return sections.join("\n\n");
}
