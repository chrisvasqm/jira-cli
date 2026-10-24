import { CliError, notFoundAs, ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { issuePath, type JiraUser } from "../core/jira-types.js";

/** Jira sends `id` as a string from some endpoints and a number from others. */
export interface Attachment {
  id: string | number;
  filename: string;
  size: number;
  mimeType?: string;
  author?: JiraUser;
  created: string;
}

function missing(key: string, id: string): string {
  return `Attachment ${id} is not on ${key}.`;
}

/** /rest/api/3/issue/{key}/attachments and /rest/api/3/attachment endpoints. */
export class AttachmentService {
  constructor(private readonly http = HttpClient.get()) {}

  /** The ticket's attachments, as Jira lists them in its `attachment` field. */
  async list(key: string): Promise<Attachment[]> {
    const params = new URLSearchParams({ fields: "attachment" });
    const issue = await this.http
      .get<{ fields: { attachment?: Attachment[] } }>(`${issuePath(key)}?${params}`)
      .catch(ticketNotFound(key));
    return issue.fields.attachment ?? [];
  }

  /** One attachment of `key`; ATTACHMENT_NOT_FOUND when it belongs to another ticket or none. */
  async find(key: string, id: string): Promise<Attachment> {
    const found = (await this.list(key)).find((item) => String(item.id) === id);
    if (!found) throw new CliError("ATTACHMENT_NOT_FOUND", missing(key, id));
    return found;
  }

  /** POST multipart: every file in one request. Jira answers 413 when a file is over its limit. */
  add(key: string, files: File[]): Promise<Attachment[]> {
    const form = new FormData();
    for (const file of files) form.append("file", file);
    return this.http
      .upload<Attachment[]>(`${issuePath(key)}/attachments`, form)
      .catch(ticketNotFound(key))
      .catch((err: unknown) => {
        if (err instanceof CliError && err.status === 413) {
          throw new CliError(
            "ATTACHMENT_TOO_LARGE",
            "Jira refused the upload: a file is over its size limit.",
          );
        }
        throw err;
      });
  }

  /** The file's bytes. `redirect=false` keeps it one authenticated request instead of a redirect. */
  content(key: string, id: string): Promise<ReadableStream<Uint8Array>> {
    return this.http
      .download(`/rest/api/3/attachment/content/${id}?redirect=false`)
      .catch(notFoundAs("ATTACHMENT_NOT_FOUND", missing(key, id)));
  }

  async remove(key: string, id: string): Promise<void> {
    await this.http
      .delete<undefined>(`/rest/api/3/attachment/${id}`)
      .catch(notFoundAs("ATTACHMENT_NOT_FOUND", missing(key, id)));
  }
}
