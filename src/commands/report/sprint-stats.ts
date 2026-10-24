import { isDone, type Issue } from "../../core/jira-types.js";
import { sumNumbers } from "../../core/metrics.js";
import type { Sprint } from "../../services/board.service.js";
import type { BoardContext } from "./common.js";

/** A sprint's tickets, with the board's estimate field (story points) when it has one. */
export async function sprintIssues(ctx: BoardContext, sprint: Sprint): Promise<Issue[]> {
  const extraFields = ctx.board.estimation ? [ctx.board.estimation.fieldId] : [];
  const result = await ctx.boards.issues(ctx.boardId, { limit: 5000, sprintIds: [sprint.id], extraFields });
  return result.issues;
}

export function points(ctx: BoardContext, issues: Issue[]): number | null {
  const field = ctx.board.estimation?.fieldId;
  if (!field) return null;
  return sumNumbers(issues.map((issue) => (issue.fields as unknown as Record<string, unknown>)[field]));
}

export function doneOf(issues: Issue[]): Issue[] {
  return issues.filter(isDone);
}

export function sprintSummary(sprint: Sprint) {
  return {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    goal: sprint.goal ?? null,
    startDate: sprint.startDate ?? null,
    endDate: sprint.endDate ?? null,
    completeDate: sprint.completeDate ?? null,
  };
}
