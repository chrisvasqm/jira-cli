import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { round1 } from "../../core/metrics.js";
import { grid, printResult } from "../../core/output.js";
import { boardSprints, plural, localDate, reportContext, type ReportOptions } from "./common.js";
import { doneOf, points, sprintIssues } from "./sprint-stats.js";

interface VelocityOptions extends ReportOptions {
  sprints: string;
}

interface SprintVelocity {
  id: number;
  name: string;
  completeDate: string | null;
  total: number;
  done: number;
  pointsTotal: number | null;
  pointsDone: number | null;
}

interface Velocity {
  boardId: number;
  pointsField: string | null;
  sprints: SprintVelocity[];
  average: { done: number | null; pointsDone: number | null };
}

export function registerVelocity(report: Command): void {
  report
    .command("velocity")
    .description("Tickets and points done in each recent closed sprint")
    .option("--board <id>", "Board id (default: the configured board)")
    .option("--sprints <n>", "How many recent closed sprints", "6")
    .action(async (opts: VelocityOptions, cmd: Command) => {
      const count = intInRange(opts.sprints, "--sprints", 1, 50);
      const ctx = await reportContext(opts, cmd);
      const closed = await boardSprints(ctx, "closed");
      const recent = closed
        .toSorted((left, right) => (right.completeDate ?? "").localeCompare(left.completeDate ?? ""))
        .slice(0, count)
        .toReversed();
      const sprints = await Promise.all(
        recent.map(async (sprint): Promise<SprintVelocity> => {
          const issues = await sprintIssues(ctx, sprint);
          const done = doneOf(issues);
          return {
            id: sprint.id,
            name: sprint.name,
            completeDate: sprint.completeDate ?? null,
            total: issues.length,
            done: done.length,
            pointsTotal: points(ctx, issues),
            pointsDone: points(ctx, done),
          };
        }),
      );
      const view: Velocity = {
        boardId: ctx.boardId,
        pointsField: ctx.board.estimation?.name ?? null,
        sprints,
        average: {
          done: average(sprints.map((sprint) => sprint.done)),
          pointsDone: ctx.board.estimation ? average(sprints.map((sprint) => sprint.pointsDone ?? 0)) : null,
        },
      };
      printResult(ctx.mode, view, () => renderHuman(view));
    });
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function renderHuman(view: Velocity): string {
  if (view.sprints.length === 0) return `Board ${view.boardId} has no closed sprints yet.`;
  const withPoints = view.pointsField !== null;
  const rows = view.sprints.map((sprint) => [
    sprint.name,
    localDate(sprint.completeDate),
    `${sprint.done}/${sprint.total}`,
    ...(withPoints ? [`${sprint.pointsDone ?? 0}/${sprint.pointsTotal ?? 0}`] : []),
  ]);
  const header = ["Sprint", "Closed", "Done", ...(withPoints ? [view.pointsField ?? "Points"] : [])];
  const avg = `Average done: ${plural(view.average.done ?? 0, "ticket")}${withPoints ? `, ${plural(view.average.pointsDone ?? 0, "point")}` : ""} per sprint.`;
  return [`Velocity on board ${view.boardId}`, grid([header, ...rows]), avg].join("\n\n");
}
