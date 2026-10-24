import type { Command } from "commander";
import { intInRange, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { toCommentView, type CommentView } from "../../core/jira-types.js";
import { printResult } from "../../core/output.js";
import { CommentService } from "../../services/comment.service.js";
import { renderComments } from "../render.js";

interface ListOptions {
  limit: string;
}

interface CommentList {
  key: string;
  total: number;
  comments: CommentView[];
}

export function registerList(comment: Command): void {
  comment
    .command("list <key>")
    .description("Show a ticket's comments, oldest first")
    .option("-n, --limit <n>", "Maximum comments to fetch", "50")
    .action(async (rawKey: string, opts: ListOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const limit = intInRange(opts.limit, "--limit", 1);
      const { mode } = bootstrap(cmd);
      const page = await new CommentService().list(key, limit);
      const view: CommentList = { key, total: page.total, comments: page.comments.map(toCommentView) };
      printResult(mode, view, () => renderHuman(view));
    });
}

function renderHuman(view: CommentList): string {
  if (view.total === 0) return `${view.key} has no comments.`;
  const body = renderComments(`${view.key} comments`, view.comments, view.total, "first");
  return view.comments.length < view.total ? `${body}\n\nRaise --limit to see more.` : body;
}
