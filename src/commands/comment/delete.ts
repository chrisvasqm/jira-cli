import type { Command } from "commander";
import { commentId, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { CommentService } from "../../services/comment.service.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(comment: Command): void {
  comment
    .command("delete <key> <id>")
    .description("Delete a comment (asks first; --yes skips the question)")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawKey: string, rawId: string, opts: DeleteOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const id = commentId(rawId);
      const { mode } = bootstrap(cmd);
      await confirm(`Delete comment #${id} on ${key}? This cannot be undone.`, opts.yes);
      await new CommentService().remove(key, id);
      printResult(mode, { key, id, deleted: true }, () => `Deleted comment #${id} on ${key}.`);
    });
}
