import type { Command } from "commander";
import { attachmentId, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { AttachmentService } from "../../services/attachment.service.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerDelete(attachment: Command): void {
  attachment
    .command("delete <key> <id>")
    .description("Delete an attachment (asks first; --yes skips the question)")
    .option("-y, --yes", "Delete without asking")
    .action(async (rawKey: string, rawId: string, opts: DeleteOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const id = attachmentId(rawId);
      const { mode } = bootstrap(cmd);
      const attachments = new AttachmentService();
      // The id must be on this ticket, so a mistyped key never deletes another ticket's file.
      const { filename } = await attachments.find(key, id);
      if (!opts.yes)
        await confirm(`Delete attachment ${id} "${filename}" from ${key}? This cannot be undone.`);
      await attachments.remove(key, id);
      printResult(
        mode,
        { key, id, filename, deleted: true },
        () => `Deleted attachment ${id} (${filename}) from ${key}.`,
      );
    });
}
