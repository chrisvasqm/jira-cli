import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { CliError } from "../../core/errors.js";
import { isDone, type Issue } from "../../core/jira-types.js";
import { grid, printResult, table } from "../../core/output.js";
import { onlyActive, type Sprint } from "../../services/board.service.js";
import { SprintService } from "../../services/sprint.service.js";
import {
  boardSprints,
  plural,
  localDate,
  person,
  reportContext,
  type BoardContext,
  type ReportOptions,
} from "./common.js";
import { doneOf, points, sprintIssues, sprintSummary } from "./sprint-stats.js";

interface SprintReport {
  boardId: number;
  sprint: ReturnType<typeof sprintSummary>;
  tickets: { total: number; done: number; notDone: number };
  points: { field: string; total: number | null; done: number | null } | null;
  byAssignee: { assignee: string | null; total: number; done: number; points: number | null }[];
  byStatus: { status: string; count: number }[];
  /** Not done: still open in an active sprint, carried over from a closed one. */
  notDone: { key: string; summary: string; status: string; assignee: string | null }[];
}

export function registerSprint(report: Command): void {
  report
    .command("sprint [id]")
    .description("One sprint: planned vs done, by person and status, points, what is not done")
    .option("-b, --board <id>", "Board id (default: the configured board)")
    .action(async (rawId: string | undefined, opts: ReportOptions, cmd: Command) => {
      const sprintId = rawId === undefined ? undefined : intInRange(rawId, "sprint id", 1);
      const ctx = await reportContext(opts, cmd);
      const sprint =
        sprintId === undefined ? await currentSprint(ctx) : await new SprintService().get(sprintId);
      const issues = await sprintIssues(ctx, sprint);
      const view = build(ctx, sprint, issues);
      printResult(ctx.mode, view, () => renderHuman(view));
    });
}

/** The active sprint (SPRINT_AMBIGUOUS when there are several), or else the most recently closed one. */
async function currentSprint(ctx: BoardContext): Promise<Sprint> {
  const active = onlyActive(ctx.boardId, await boardSprints(ctx, "active"));
  if (active) return active;
  const closed = await boardSprints(ctx, "closed");
  const latest = closed.toSorted((left, right) =>
    (right.completeDate ?? "").localeCompare(left.completeDate ?? ""),
  )[0];
  if (!latest) throw new CliError("NO_ACTIVE_SPRINT", `Board ${ctx.boardId} has no active or closed sprint.`);
  return latest;
}

function build(ctx: BoardContext, sprint: Sprint, issues: Issue[]): SprintReport {
  const done = doneOf(issues);
  const people = new Map<string | null, Issue[]>();
  const statuses = new Map<string, number>();
  for (const issue of issues) {
    const assignee = issue.fields.assignee?.displayName ?? null;
    people.set(assignee, [...(people.get(assignee) ?? []), issue]);
    statuses.set(issue.fields.status.name, (statuses.get(issue.fields.status.name) ?? 0) + 1);
  }
  const estimation = ctx.board.estimation;
  return {
    boardId: ctx.boardId,
    sprint: sprintSummary(sprint),
    tickets: { total: issues.length, done: done.length, notDone: issues.length - done.length },
    points: estimation
      ? { field: estimation.name, total: points(ctx, issues), done: points(ctx, done) }
      : null,
    byAssignee: [...people.entries()]
      .map(([assignee, own]) => ({
        assignee,
        total: own.length,
        done: doneOf(own).length,
        points: points(ctx, own),
      }))
      .toSorted((left, right) => right.total - left.total),
    byStatus: [...statuses.entries()].map(([status, count]) => ({ status, count })),
    notDone: issues
      .filter((issue) => !isDone(issue))
      .map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName ?? null,
      })),
  };
}

function renderHuman(view: SprintReport): string {
  const { sprint, tickets } = view;
  const pct = tickets.total === 0 ? 0 : Math.round((tickets.done / tickets.total) * 100);
  const rows: [string, string][] = [
    ["State", sprint.state],
    ["Dates", `${localDate(sprint.startDate)} → ${localDate(sprint.completeDate ?? sprint.endDate)}`],
    ["Done", `${tickets.done} of ${plural(tickets.total, "ticket")} (${pct}%)`],
  ];
  if (sprint.goal) rows.splice(1, 0, ["Goal", sprint.goal]);
  if (view.points)
    rows.push([view.points.field, `${view.points.done ?? 0} of ${view.points.total ?? 0} done`]);
  const people = grid([
    ["Person", "Tickets", "Done", ...(view.points ? ["Points"] : [])],
    ...view.byAssignee.map((row) => [
      person(row.assignee),
      String(row.total),
      String(row.done),
      ...(view.points ? [String(row.points ?? 0)] : []),
    ]),
  ]);
  const sections = [
    `${sprint.name} (#${sprint.id}) on board ${view.boardId}`,
    table(rows),
    `By person\n\n${people}`,
  ];
  if (view.notDone.length > 0) {
    const label = sprint.state === "closed" ? "Carried over (not done)" : "Not done yet";
    const list = view.notDone.map((item) => [item.key, item.status, person(item.assignee), item.summary]);
    sections.push(`${label}\n\n${grid([["Key", "Status", "Person", "Summary"], ...list])}`);
  }
  return sections.join("\n\n");
}
