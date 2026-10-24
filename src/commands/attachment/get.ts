import { createWriteStream } from "node:fs";
import { access, rename, stat, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";
import type { Command } from "commander";
import { attachmentId, issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { AttachmentService } from "../../services/attachment.service.js";
import { formatSize, toAttachmentView } from "./common.js";

interface GetOptions {
  output?: string;
  yes?: boolean;
}

export function registerGet(attachment: Command): void {
  attachment
    .command("get <key> <id>")
    .description("Download an attachment (default: its filename in the current directory)")
    .option("-ou, --output <path>", "File to write, or an existing directory to write into")
    .option("-y, --yes", "Overwrite an existing file")
    .action(async (rawKey: string, rawId: string, opts: GetOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const id = attachmentId(rawId);
      const { mode } = bootstrap(cmd);
      const attachments = new AttachmentService();
      const found = toAttachmentView(await attachments.find(key, id));
      const path = await destination(opts.output, safeName(found.filename, id));
      if (!opts.yes && (await exists(path))) {
        throw new CliError("FILE_EXISTS", `${path} already exists. Pass --yes to overwrite it.`);
      }
      await save(await attachments.content(key, id), path);
      printResult(
        mode,
        { key, ...found, path },
        () => `Saved ${found.filename} (${formatSize(found.size)}) to ${path}.`,
      );
    });
}

/** Jira filenames are user-written: keep one plain name, never a path such as "../x". */
function safeName(filename: string, id: string): string {
  const name = filename.replace(/[\p{Cc}\p{Cf}\\/:*?"<>|]/gu, "_").trim();
  return name === "" || /^\.+$/.test(name) ? `attachment-${id}` : name;
}

/** `--output` as a file, or the attachment's name inside it when it is a directory. */
async function destination(output: string | undefined, name: string): Promise<string> {
  if (output === undefined) return resolve(name);
  const info = await stat(output).catch(() => undefined);
  if (info?.isDirectory()) return resolve(output, name);
  if (output.endsWith(sep) || output.endsWith("/")) {
    throw new CliError("FILE_ERROR", `Cannot write to ${output}: no such directory`);
  }
  return resolve(output);
}

function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Writes to a temporary file first, so a failed download never leaves half a file at `path`. */
async function save(body: ReadableStream<Uint8Array>, path: string): Promise<void> {
  const partial = `${path}.${process.pid}.part`;
  try {
    await pipeline(
      Readable.fromWeb(body as WebStream<Uint8Array>),
      createWriteStream(partial, { flags: "wx" }),
    );
    await rename(partial, path);
  } catch (err) {
    await unlink(partial).catch(() => undefined);
    const why = err instanceof Error ? err.message : String(err);
    // File system errors carry a syscall; anything else broke while reading from Jira.
    if (err instanceof Error && "syscall" in err) {
      throw new CliError("FILE_ERROR", `Cannot write ${path}: ${why}`);
    }
    throw new CliError("NETWORK_ERROR", `The download of ${path} broke off`, why);
  }
}
