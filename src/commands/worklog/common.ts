import { adfToText } from "../../core/adf.js";
import type { Worklog } from "../../services/worklog.service.js";
import { localTime } from "../render.js";

export interface WorklogView {
  id: string;
  author: string | null;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
  comment: string;
}

export function toWorklogView(worklog: Worklog): WorklogView {
  return {
    id: worklog.id,
    author: worklog.author?.displayName ?? null,
    started: worklog.started,
    timeSpent: worklog.timeSpent,
    timeSpentSeconds: worklog.timeSpentSeconds,
    comment: adfToText(worklog.comment),
  };
}

/** "2h 30m · Ana · 2026-10-23 14:05 GMT-4 · #10001" followed by the note, if any. */
export function renderWorklog(worklog: WorklogView): string {
  const line = `${worklog.timeSpent} · ${worklog.author ?? "unknown"} · ${localTime(worklog.started)} · #${worklog.id}`;
  return worklog.comment ? `${line}\n${worklog.comment}` : line;
}
