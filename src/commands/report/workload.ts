import type { Command } from "commander";
import { intInRange } from "../../core/args.js";
import { grid, printResult } from "../../core/output.js";
import { SearchService } from "../../services/search.service.js";
import { boardJql, person, reportContext, type ReportOptions } from "./common.js";

interface WorkloadOptions extends ReportOptions {
  limit: string;
}

interface PersonLoad {
  assignee: string | null;
  total: number;
  byStatus: Record<string, number>;
}

interface Workload {
  boardId: number;
  open: number;
  hasMore: boolean;
  statuses: string[];
  people: PersonLoad[];
}

export function registerWorkload(report: Command): void {
  report
    .command("workload")
    .description("Open tickets per person and status")
    .option("--board <id>", "Board id (default: the configured board)")
    .option("--limit <n>", "Maximum open tickets to read", "1000")
    .action(async (opts: WorkloadOptions, cmd: Command) => {
      const limit = intInRange(opts.limit, "--limit", 1);
      const ctx = await reportContext(opts, cmd);
      const jql = `${boardJql(ctx)} AND statusCategory != Done`;
      const result = await new SearchService().search(jql, ["status", "assignee"], { limit });
      const loads = new Map<string | null, PersonLoad>();
      const statuses = new Set<string>();
      for (const issue of result.issues) {
        const assignee = issue.fields.assignee?.displayName ?? null;
        const status = issue.fields.status?.name ?? "Unknown";
        statuses.add(status);
        const load = loads.get(assignee) ?? { assignee, total: 0, byStatus: {} };
        load.total += 1;
        load.byStatus[status] = (load.byStatus[status] ?? 0) + 1;
        loads.set(assignee, load);
      }
      const view: Workload = {
        boardId: ctx.boardId,
        open: result.issues.length,
        hasMore: result.hasMore,
        statuses: [...statuses],
        people: [...loads.values()].toSorted((left, right) => right.total - left.total),
      };
      printResult(ctx.mode, view, () => renderHuman(view));
    });
}

function renderHuman(view: Workload): string {
  if (view.open === 0) return `Board ${view.boardId} has no open tickets.`;
  const header = ["Person", "Open", ...view.statuses];
  const rows = view.people.map((load) => [
    person(load.assignee),
    String(load.total),
    ...view.statuses.map((status) => String(load.byStatus[status] ?? 0)),
  ]);
  const more = view.hasMore ? "\n\nMore open tickets exist; raise --limit." : "";
  return `Open tickets on board ${view.boardId}: ${view.open}\n\n${grid([header, ...rows])}${more}`;
}
