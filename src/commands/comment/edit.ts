import type { Command } from "commander";
import { textToAdf } from "../../core/adf.js";
import { commentId, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { readText } from "../../core/input.js";
import { toCommentView } from "../../core/jira-types.js";
import { printResult } from "../../core/output.js";
import { CommentService } from "../../services/comment.service.js";

interface EditOptions {
  file?: string;
}

export function registerEdit(comment: Command): void {
  comment
    .command("edit <key> <id> [text]")
    .description("Replace a comment's text")
    .option("-f, --file <path>", "Read the new text from a file (- reads stdin)")
    .action(
      async (rawKey: string, rawId: string, inline: string | undefined, opts: EditOptions, cmd: Command) => {
        const key = issueKey(rawKey);
        const id = commentId(rawId);
        const text = await readText(inline, opts.file, "comment");
        const { mode } = bootstrap(cmd);
        const updated = toCommentView(await new CommentService().update(key, id, textToAdf(text)));
        printResult(mode, { key, comment: updated }, () => `Updated comment #${id} on ${key}.`);
      },
    );
}
