import { CliError, notFoundAs, ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { issuePath } from "../core/jira-types.js";

interface RemoteLink {
  id: number;
  object?: { url?: string; title?: string };
}

/** Web link ids start with "w" so they never clash with issue link ids, e.g. "w10000". */
export const WEB_LINK_PREFIX = "w";

export interface WebLinkView {
  id: string;
  title: string;
  url: string;
}

function toWebLinkView(link: RemoteLink): WebLinkView {
  return {
    id: `${WEB_LINK_PREFIX}${link.id}`,
    title: link.object?.title ?? "",
    url: link.object?.url ?? "",
  };
}

/** /rest/api/3/issue/{key}/remotelink endpoints (web links). */
export class RemoteLinkService {
  constructor(private readonly http = HttpClient.get()) {}

  async list(key: string): Promise<WebLinkView[]> {
    const links = await this.http.get<RemoteLink[]>(this.path(key)).catch(ticketNotFound(key));
    return links.map(toWebLinkView);
  }

  async add(key: string, url: string, title: string): Promise<WebLinkView> {
    const created = await this.http
      .post<{ id: number }>(this.path(key), { object: { url, title } })
      .catch(ticketNotFound(key));
    return toWebLinkView({ id: created.id, object: { url, title } });
  }

  /** The ticket's web link `id` (the number without the "w" prefix); LINK_NOT_FOUND when it has none. */
  async find(key: string, id: string): Promise<WebLinkView> {
    const link = (await this.list(key)).find((item) => item.id === `${WEB_LINK_PREFIX}${id}`);
    if (!link) throw new CliError("LINK_NOT_FOUND", `${key} has no web link ${WEB_LINK_PREFIX}${id}.`);
    return link;
  }

  /** `id` is the number without the "w" prefix. */
  async remove(key: string, id: string): Promise<void> {
    await this.http
      .delete<undefined>(`${this.path(key)}/${id}`)
      .catch(
        notFoundAs(
          "LINK_NOT_FOUND",
          `Web link ${WEB_LINK_PREFIX}${id} on ${key} does not exist, or the ticket does not.`,
        ),
      );
  }

  private path(key: string): string {
    return `${issuePath(key)}/remotelink`;
  }
}
