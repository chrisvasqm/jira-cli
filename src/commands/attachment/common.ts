import type { Attachment } from "../../services/attachment.service.js";

export interface AttachmentView {
  id: string;
  filename: string;
  /** Bytes. */
  size: number;
  mimeType: string | null;
  author: string | null;
  created: string;
}

export function toAttachmentView(attachment: Attachment): AttachmentView {
  return {
    id: String(attachment.id),
    filename: attachment.filename,
    size: attachment.size,
    mimeType: attachment.mimeType ?? null,
    author: attachment.author?.displayName ?? null,
    created: attachment.created,
  };
}

const UNITS = ["B", "KB", "MB", "GB"];

/** "512 B", "1.5 KB", "12 MB" (1 KB = 1024 bytes). */
export function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}
