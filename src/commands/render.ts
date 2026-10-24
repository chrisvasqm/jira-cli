import type { Config } from "../core/config.js";
import type { CommentView } from "../core/jira-types.js";

const LOCAL_TIME = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZoneName: "shortOffset",
});

/** Local time, e.g. "2026-10-23 14:05 GMT-4". JSON output keeps Jira's ISO string. */
export function localTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const part = Object.fromEntries(LOCAL_TIME.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${part["year"]}-${part["month"]}-${part["day"]} ${part["hour"]}:${part["minute"]} ${part["timeZoneName"]}`;
}

/** "Ana · 2026-10-23 14:05 GMT-4 · #10001" followed by the body. */
export function renderComment(comment: CommentView): string {
  return `${comment.author ?? "unknown"} · ${localTime(comment.created)} · #${comment.id}\n${comment.body}`;
}

/** Link that opens the ticket in the browser. */
export function ticketUrl(config: Config, key: string): string {
  return `${config.baseUrl}/browse/${key}`;
}
