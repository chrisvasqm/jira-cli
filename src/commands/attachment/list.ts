import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, printResult } from "../../core/output.js";
import { AttachmentService } from "../../services/attachment.service.js";
import { localTime } from "../render.js";
import { formatSize, toAttachmentView, type AttachmentView } from "./common.js";

export function registerList(attachment: Command): void {
  attachment
    .command("list <key>")
    .description("Show a ticket's attachments")
    .action(async (rawKey: string, _opts: unknown, cmd: Command) => {
      const key = issueKey(rawKey);
      const { mode } = bootstrap(cmd);
      const attachments = (await new AttachmentService().list(key)).map(toAttachmentView);
      printResult(mode, { key, attachments }, () => renderHuman(key, attachments));
    });
}

function renderHuman(key: string, attachments: AttachmentView[]): string {
  if (attachments.length === 0) return `${key} has no attachments.`;
  const header = ["ID", "FILENAME", "SIZE", "TYPE", "AUTHOR", "CREATED"];
  const rows = attachments.map((item) => [
    item.id,
    item.filename,
    formatSize(item.size),
    item.mimeType ?? "",
    item.author ?? "unknown",
    localTime(item.created),
  ]);
  return grid([header, ...rows]);
}
