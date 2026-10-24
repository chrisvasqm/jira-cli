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

/** A heading such as "Comments (latest 5 of 12)" followed by each comment. */
export function renderComments(
  title: string,
  shown: CommentView[],
  total: number,
  which: "latest" | "first",
): string {
  const heading =
    shown.length < total ? `${title} (${which} ${shown.length} of ${total})` : `${title} (${total})`;
  return [heading, ...shown.map(renderComment)].join("\n\n");
}

/** Link that opens the ticket in the browser. */
export function ticketUrl(config: Config, key: string): string {
  return `${config.baseUrl}/browse/${key}`;
}
