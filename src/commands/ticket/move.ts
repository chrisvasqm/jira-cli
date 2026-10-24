import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import type { Config } from "../../core/config.js";
import { CliError } from "../../core/errors.js";
import { printResult, table } from "../../core/output.js";
import { BoardService } from "../../services/board.service.js";
import { TransitionService, type Transition } from "../../services/transition.service.js";

interface TransitionView {
  id: string;
  name: string;
  to: string;
}

export function registerMove(ticket: Command): void {
  ticket
    .command("move <key> [target]")
    .description("Move a ticket to a status, transition or board column. Without a target, list the options")
    .action(async (rawKey: string, target: string | undefined, _opts: unknown, cmd: Command) => {
      const key = issueKey(rawKey);
      const { config, mode } = bootstrap(cmd);
      const service = new TransitionService();
      const transitions = await service.list(key);
      if (target === undefined) {
        const options = transitions.map(toView);
        printResult(mode, { key, transitions: options }, () => renderOptions(key, options));
        return;
      }
      const chosen = await pick(transitions, target, config);
      await service.apply(key, chosen.id);
      const result = { key, status: chosen.to.name, transition: toView(chosen) };
      printResult(mode, result, () => `Moved ${key} to ${chosen.to.name}.`);
    });
}

function toView(transition: Transition): TransitionView {
  return { id: transition.id, name: transition.name, to: transition.to.name };
}

function same(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

/** Match a transition id, transition name or target status name; then fall back to a board column name. */
async function pick(transitions: Transition[], target: string, config: Config): Promise<Transition> {
  const direct = transitions.filter(
    (item) => item.id === target || same(item.name, target) || same(item.to.name, target),
  );
  const matches = direct.length > 0 ? direct : await byColumn(transitions, target, config);
  const statuses = new Set(matches.map((item) => item.to.id));
  const [first] = matches;
  if (first && statuses.size === 1) return first;
  const available = transitions.map(toView);
  if (!first) {
    const names = available.map((item) => item.to).join(", ") || "none";
    throw new CliError("NO_TRANSITION", `Cannot move to "${target}" from here. Allowed: ${names}`, available);
  }
  throw new CliError(
    "TRANSITION_AMBIGUOUS",
    `"${target}" matches more than one status; use a transition id`,
    available,
  );
}

async function byColumn(transitions: Transition[], target: string, config: Config): Promise<Transition[]> {
  const { columns } = await new BoardService().configuration(config.boardId);
  const column = columns.find((item) => same(item.name, target));
  if (!column) return [];
  return transitions.filter((item) => column.statusIds.includes(item.to.id));
}

function renderOptions(key: string, options: TransitionView[]): string {
  if (options.length === 0) return `${key} has no transitions available.`;
  const rows = options.map((item) => {
    const via = item.name === item.to ? `id ${item.id}` : `via "${item.name}", id ${item.id}`;
    return [item.to, via] as const;
  });
  return [`${key} can move to:`, table(rows), `Run: jira ticket move ${key} "<status>"`].join("\n\n");
}
