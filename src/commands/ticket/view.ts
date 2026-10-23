import type { Command } from "commander";
import { adfToText } from "../../core/adf.js";
import { intInRange, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import {
  summarize,
  toCommentView,
  type CommentView,
  type IssueDetail,
  type IssueSummary,
} from "../../core/jira-types.js";
import { printResult, table } from "../../core/output.js";
import { CommentService } from "../../services/comment.service.js";
import { IssueService } from "../../services/issue.service.js";

interface ViewOptions {
  comments: string;
}

/** Jira's comment endpoint returns at most 100 per page. */
const MAX_COMMENTS = 100;

export interface TicketView extends IssueSummary {
  url: string;
  reporter: string | null;
  labels: string[];
  parent: { key: string; summary: string | null } | null;
  created: string;
  description: string;
  /** total is null when comments were not requested (--comments 0). */
  comments: { total: number | null; shown: CommentView[] };
}

export function registerView(ticket: Command): void {
  ticket
    .command("view <key>")
    .description("Show a ticket's details, description and latest comments")
    .option(
      "--comments <n>",
      `How many of the latest comments to show (0 for none, at most ${MAX_COMMENTS})`,
      "5",
    )
    .action(async (rawKey: string, opts: ViewOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const limit = intInRange(opts.comments, "--comments", 0, MAX_COMMENTS);
      const { config, mode } = bootstrap(cmd);
      const [issue, comments] = await Promise.all([
        new IssueService().get(key),
        limit > 0 ? new CommentService().latest(key, limit) : Promise.resolve(undefined),
      ]);
      const view = toView(issue, `${config.baseUrl}/browse/${issue.key}`, {
        total: comments?.total ?? null,
        shown: (comments?.comments ?? []).map(toCommentView),
      });
      printResult(mode, view, () => renderHuman(view));
    });
}

function toView(issue: IssueDetail, url: string, comments: TicketView["comments"]): TicketView {
  const { fields } = issue;
  return {
    ...summarize(issue),
    url,
    reporter: fields.reporter?.displayName ?? null,
    labels: fields.labels ?? [],
    parent: fields.parent ? { key: fields.parent.key, summary: fields.parent.fields?.summary ?? null } : null,
    created: fields.created,
    description: adfToText(fields.description),
    comments,
  };
}

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
function day(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const part = Object.fromEntries(LOCAL_TIME.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${part["year"]}-${part["month"]}-${part["day"]} ${part["hour"]}:${part["minute"]} ${part["timeZoneName"]}`;
}

function renderHuman(view: TicketView): string {
  const rows: [string, string][] = [
    ["Status", view.status],
    ["Type", view.type],
    ["Priority", view.priority ?? "none"],
    ["Assignee", view.assignee ?? "unassigned"],
    ["Reporter", view.reporter ?? "unknown"],
  ];
  if (view.parent) rows.push(["Parent", `${view.parent.key} ${view.parent.summary ?? ""}`.trim()]);
  if (view.labels.length > 0) rows.push(["Labels", view.labels.join(", ")]);
  rows.push(["Created", day(view.created)], ["Updated", day(view.updated)], ["URL", view.url]);

  const sections = [
    `${view.key}  ${view.summary}`,
    table(rows),
    `Description\n\n${view.description || "(none)"}`,
  ];
  const { total, shown } = view.comments;
  if (total !== null && total > 0) {
    const heading =
      shown.length < total ? `Comments (latest ${shown.length} of ${total})` : `Comments (${total})`;
    const bodies = shown.map(
      (comment) =>
        `${comment.author ?? "unknown"} · ${day(comment.created)} · #${comment.id}\n${comment.body}`,
    );
    sections.push([heading, ...bodies].join("\n\n"));
  }
  return sections.join("\n\n");
}
