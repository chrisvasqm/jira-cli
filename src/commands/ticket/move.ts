import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult, table } from "../../core/output.js";
import { sameName } from "../../core/text.js";
import { BoardService, type BoardConfig } from "../../services/board.service.js";
import { TransitionService, type Transition } from "../../services/transition.service.js";
import {
  applyAll,
  bulkOptions,
  confirmBulk,
  parseSelection,
  printBulk,
  selectedKeys,
  type BulkOptions,
} from "./bulk.js";

interface TransitionView {
  id: string;
  name: string;
  to: string;
}

interface Moved {
  key: string;
  status: string;
  transition: TransitionView;
}

/** The configured board's columns, read at most once per run and only when needed. */
type Columns = () => Promise<BoardConfig["columns"]>;

export function registerMove(ticket: Command): void {
  const move = ticket
    .command("move [key] [target]")
    .description(
      "Move a ticket to a status, transition or board column. Without a target, list the options. A comma-separated key list or --jql moves several",
    )
    .action(
      async (rawKey: string | undefined, rawTarget: string | undefined, opts: BulkOptions, cmd: Command) => {
        // With --jql the only argument is the target.
        const [keyArg, target] =
          opts.jql !== undefined && rawTarget === undefined ? [undefined, rawKey] : [rawKey, rawTarget];
        const selection = parseSelection(keyArg, opts);
        if (selection.bulk && target === undefined) {
          throw new CliError("USAGE", "Moving several tickets needs a target status");
        }
        const { config, mode } = bootstrap(cmd);
        const service = new TransitionService();
        let board: Promise<BoardConfig["columns"]> | undefined;
        // The column fallback is a bonus: if the board cannot be read, report the allowed moves instead.
        const columns: Columns = () =>
          (board ??= new BoardService()
            .configuration(config.boardId)
            .then((found) => found.columns)
            .catch(() => []));
        const apply = async (key: string, wanted: string): Promise<Moved> => {
          const chosen = await pick(await service.list(key), wanted, columns);
          await service.apply(key, chosen.id);
          return { key, status: chosen.to.name, transition: toView(chosen) };
        };
        if (!selection.bulk) {
          const { key } = selection;
          if (target === undefined) {
            const options = (await service.list(key)).map(toView);
            printResult(mode, { key, transitions: options }, () => renderOptions(key, options));
            return;
          }
          const result = await apply(key, target);
          printResult(mode, result, () => `Moved ${key} to ${result.status}.`);
          return;
        }
        const wanted = target ?? "";
        const keys = await selectedKeys(selection, opts, config);
        await confirmBulk(keys, `Move to "${wanted}"`, opts.yes);
        const result = await applyAll(keys, async (key) => apply(key, wanted));
        printBulk(mode, result, (item) => `Moved ${item.key} to ${item.status}.`);
      },
    );
  bulkOptions(move);
}

function toView(transition: Transition): TransitionView {
  return { id: transition.id, name: transition.name, to: transition.to.name };
}

/** Match a transition id, transition name or target status name; then fall back to a board column name. */
async function pick(transitions: Transition[], target: string, columns: Columns): Promise<Transition> {
  const direct = transitions.filter(
    (item) => item.id === target || sameName(item.name, target) || sameName(item.to.name, target),
  );
  const matches = direct.length > 0 ? direct : await byColumn(transitions, target, columns);
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

async function byColumn(transitions: Transition[], target: string, columns: Columns): Promise<Transition[]> {
  const column = (await columns()).find((item) => sameName(item.name, target));
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
