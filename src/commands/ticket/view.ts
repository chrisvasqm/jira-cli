import type { Command } from "commander";
import { adfToText } from "../../core/adf.js";
import { issueKey, nonNegativeInt } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import type { CommentView, IssueDetail } from "../../core/jira-types.js";
import { printResult, table } from "../../core/output.js";
import { CommentService, toCommentView } from "../../services/comment.service.js";
import { IssueService } from "../../services/issue.service.js";

interface ViewOptions {
  comments: string;
}

export interface TicketView {
  key: string;
  url: string;
  type: string;
  status: string;
  summary: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  labels: string[];
  parent: { key: string; summary: string | null } | null;
  created: string;
  updated: string;
  description: string;
  comments: { total: number; shown: CommentView[] };
}

export function registerView(ticket: Command): void {
  ticket
    .command("view <key>")
    .description("Show a ticket's details, description and latest comments")
    .option("--comments <n>", "How many of the latest comments to show (0 for none)", "5")
    .action(async (rawKey: string, opts: ViewOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const limit = nonNegativeInt(opts.comments, "--comments");
      const { config, mode } = bootstrap(cmd);
      const [issue, comments] = await Promise.all([
        new IssueService().get(key),
        new CommentService().latest(key, limit),
      ]);
      const view = toView(issue, `${config.baseUrl}/browse/${issue.key}`, {
        total: comments.total,
        shown: comments.comments.map(toCommentView),
      });
      printResult(mode, view, () => renderHuman(view));
    });
}

function toView(issue: IssueDetail, url: string, comments: TicketView["comments"]): TicketView {
  const { fields } = issue;
  return {
    key: issue.key,
    url,
    type: fields.issuetype.name,
    status: fields.status.name,
    summary: fields.summary,
    priority: fields.priority?.name ?? null,
    assignee: fields.assignee?.displayName ?? null,
    reporter: fields.reporter?.displayName ?? null,
    labels: fields.labels ?? [],
    parent: fields.parent ? { key: fields.parent.key, summary: fields.parent.fields?.summary ?? null } : null,
    created: fields.created,
    updated: fields.updated,
    description: adfToText(fields.description),
    comments,
  };
}

function day(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
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
  if (total > 0) {
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
