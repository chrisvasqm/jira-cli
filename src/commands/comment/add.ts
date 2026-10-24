import type { Command } from "commander";
import { textToAdf } from "../../core/adf.js";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { readText } from "../../core/input.js";
import { toCommentView } from "../../core/jira-types.js";
import { printResult } from "../../core/output.js";
import { CommentService } from "../../services/comment.service.js";

interface AddOptions {
  file?: string;
}

export function registerAdd(comment: Command): void {
  comment
    .command("add <key> [text]")
    .description("Add a comment. Blank lines split paragraphs; ``` fences make code blocks")
    .option("-f, --file <path>", "Read the comment from a file (- reads stdin)")
    .action(async (rawKey: string, inline: string | undefined, opts: AddOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const text = await readText(inline, opts.file, "comment");
      const { mode } = bootstrap(cmd);
      const created = toCommentView(await new CommentService().add(key, textToAdf(text)));
      printResult(mode, { key, comment: created }, () => `Added comment #${created.id} to ${key}.`);
    });
}
