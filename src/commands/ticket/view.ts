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
import { localTime, renderComments, ticketUrl } from "../render.js";
import { CommentService, MAX_LATEST } from "../../services/comment.service.js";
import type { Sprint } from "../../services/board.service.js";
import { IssueService } from "../../services/issue.service.js";
import { SprintService } from "../../services/sprint.service.js";

interface ViewOptions {
  comments: string;
}

interface TicketView extends IssueSummary {
  url: string;
  reporter: string | null;
  labels: string[];
  components: string[];
  fixVersions: string[];
  parent: { key: string; summary: string | null } | null;
  sprint: { id: number; name: string; state: string } | null;
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
      "-n, --comments <n>",
      `How many of the latest comments to show (0 for none, at most ${MAX_LATEST})`,
      "5",
    )
    .action(async (rawKey: string, opts: ViewOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const limit = intInRange(opts.comments, "--comments", 0, MAX_LATEST);
      const { config, mode } = bootstrap(cmd);
      const [issue, comments, sprint] = await Promise.all([
        new IssueService().get(key),
        limit > 0 ? new CommentService().latest(key, limit) : Promise.resolve(undefined),
        // The sprint is extra: sites without Jira Software (or the agile API) still show the ticket.
        new SprintService().ofIssue(key).catch(() => null),
      ]);
      const view = toView(issue, ticketUrl(config, issue.key), sprint, {
        total: comments?.total ?? null,
        shown: (comments?.comments ?? []).map(toCommentView),
      });
      printResult(mode, view, () => renderHuman(view));
    });
}

function toView(
  issue: IssueDetail,
  url: string,
  sprint: Sprint | null,
  comments: TicketView["comments"],
): TicketView {
  const { fields } = issue;
  return {
    ...summarize(issue),
    url,
    reporter: fields.reporter?.displayName ?? null,
    labels: fields.labels ?? [],
    components: (fields.components ?? []).map((item) => item.name),
    fixVersions: (fields.fixVersions ?? []).map((item) => item.name),
    parent: fields.parent ? { key: fields.parent.key, summary: fields.parent.fields?.summary ?? null } : null,
    sprint: sprint && { id: sprint.id, name: sprint.name, state: sprint.state },
    created: fields.created,
    description: adfToText(fields.description),
    comments,
  };
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
  if (view.sprint) rows.push(["Sprint", `${view.sprint.name} (${view.sprint.state}, #${view.sprint.id})`]);
  if (view.labels.length > 0) rows.push(["Labels", view.labels.join(", ")]);
  if (view.components.length > 0) rows.push(["Components", view.components.join(", ")]);
  if (view.fixVersions.length > 0) rows.push(["Fix versions", view.fixVersions.join(", ")]);
  rows.push(["Created", localTime(view.created)], ["Updated", localTime(view.updated)], ["URL", view.url]);

  const sections = [
    `${view.key}  ${view.summary}`,
    table(rows),
    `Description\n\n${view.description || "(none)"}`,
  ];
  const { total, shown } = view.comments;
  if (total !== null && total > 0) {
    sections.push(renderComments("Comments", shown, total, "latest"));
  }
  return sections.join("\n\n");
}
