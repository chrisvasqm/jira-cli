import { constants, openAsBlob } from "node:fs";
import { access, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { AttachmentService } from "../../services/attachment.service.js";
import { formatSize, toAttachmentView } from "./common.js";

export function registerAdd(attachment: Command): void {
  attachment
    .command("add <key> <files...>")
    .description("Upload one or more files to a ticket")
    .action(async (rawKey: string, paths: string[], _opts: unknown, cmd: Command) => {
      const key = issueKey(rawKey);
      // Every file must be readable before anything is uploaded.
      const files = await Promise.all(paths.map(localFile));
      const { mode } = bootstrap(cmd);
      const attachments = (await new AttachmentService().add(key, files)).map(toAttachmentView);
      printResult(mode, { key, attachments }, () =>
        attachments
          .map((item) => `Attached ${item.filename} (${formatSize(item.size)}) to ${key} as ${item.id}.`)
          .join("\n"),
      );
    });
}

/** A readable regular file, read lazily while the upload streams. */
async function localFile(path: string): Promise<File> {
  const fail = (why: string): never => {
    throw new CliError("FILE_ERROR", `Cannot read ${path}: ${why}`);
  };
  const info = await stat(path).catch((err: unknown) => fail(reason(err)));
  if (!info.isFile()) fail("not a file");
  await access(path, constants.R_OK).catch((err: unknown) => fail(reason(err)));
  return new File([await openAsBlob(path)], basename(path));
}

const REASONS: Record<string, string> = { ENOENT: "no such file", EACCES: "permission denied" };

function reason(err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code;
  return (code && REASONS[code]) ?? (err instanceof Error ? err.message : String(err));
}
