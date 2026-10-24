import type { Command } from "commander";
import { textToAdf } from "../../core/adf.js";
import { dateArg, duration, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { readText } from "../../core/input.js";
import { printResult } from "../../core/output.js";
import { WorklogService } from "../../services/worklog.service.js";
import { toWorklogView } from "./common.js";

interface AddOptions {
  start?: string;
  description?: string;
  file?: string;
}

export function registerAdd(worklog: Command): void {
  worklog
    .command("add <key> <duration>")
    .description("Log time on a ticket, e.g. 2h30m, 1d or 45m")
    .option("-sd, --start <date>", "When the work started, e.g. 2026-10-24 (default: now)")
    .option("-d, --description <text>", "A note about the work")
    .option("-f, --file <path>", "Read the note from a file (- reads stdin)")
    .action(async (rawKey: string, rawDuration: string, opts: AddOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const timeSpent = duration(rawDuration, "The duration");
      const started = opts.start === undefined ? new Date().toISOString() : dateArg(opts.start, "--start");
      // The note is optional, so read it only when one was given.
      const hasNote = opts.description !== undefined || opts.file !== undefined;
      const note = hasNote ? await readText(opts.description, opts.file, "note") : undefined;
      const { mode } = bootstrap(cmd);
      const created = await new WorklogService().add(key, {
        timeSpent,
        started,
        comment: note === undefined ? undefined : textToAdf(note),
      });
      const view = toWorklogView(created);
      printResult(mode, { key, worklog: view }, () => `Logged ${view.timeSpent} on ${key} (#${view.id}).`);
    });
}
