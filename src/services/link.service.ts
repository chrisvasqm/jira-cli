import { CliError, notFoundAs, ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { issuePath } from "../core/jira-types.js";
import { sameName } from "../core/text.js";

export interface LinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

interface LinkedIssue {
  key: string;
  fields?: { summary?: string; status?: { name: string } };
}

/** One entry of an issue's `issuelinks` field: exactly one of the two issues is set. */
interface IssueLink {
  id: string;
  type: LinkType;
  inwardIssue?: LinkedIssue;
  outwardIssue?: LinkedIssue;
}

/** A link as seen from one ticket: "<ticket> <phrase> <key>", e.g. "KAN-1 blocks KAN-2". */
export interface LinkView {
  id: string;
  type: string;
  direction: "outward" | "inward";
  phrase: string;
  key: string;
  status: string | null;
  summary: string | null;
}

/** A link type picked from what the user typed, and which way it points from the ticket. */
export interface LinkTypeChoice {
  type: LinkType;
  direction: "outward" | "inward";
}

function linkNotFound(key: string, id: string): (err: unknown) => never {
  return notFoundAs("LINK_NOT_FOUND", `Link ${id} on ${key} does not exist.`);
}

/**
 * Jira stores the "other" issue on each link: `outwardIssue` means the ticket points
 * outward to it ("KAN-1 blocks KAN-2"), `inwardIssue` that it points inward.
 */
function toLinkView(link: IssueLink): LinkView {
  const outward = link.outwardIssue !== undefined;
  const other = link.outwardIssue ?? link.inwardIssue;
  return {
    id: link.id,
    type: link.type.name,
    direction: outward ? "outward" : "inward",
    phrase: outward ? link.type.outward : link.type.inward,
    key: other?.key ?? "",
    status: other?.fields?.status?.name ?? null,
    summary: other?.fields?.summary ?? null,
  };
}

/** /rest/api/3/issueLink and /issueLinkType endpoints. */
export class LinkService {
  constructor(private readonly http = HttpClient.get()) {}

  async types(): Promise<LinkType[]> {
    const page = await this.http.get<{ issueLinkTypes: LinkType[] }>("/rest/api/3/issueLinkType");
    return page.issueLinkTypes;
  }

  /** Matches a type's name, outward or inward phrase, ignoring case; an inward phrase points inward. */
  async resolveType(typed: string): Promise<LinkTypeChoice> {
    const types = await this.types();
    const text = typed.trim();
    const byName = types.find((type) => sameName(type.name, text) || sameName(type.outward, text));
    if (byName) return { type: byName, direction: "outward" };
    const byInward = types.find((type) => sameName(type.inward, text));
    if (byInward) return { type: byInward, direction: "inward" };
    throw new CliError(
      "LINK_TYPE_NOT_FOUND",
      `No link type is called "${text}". Run "jira link types" to see them.`,
      types.map((type) => `${type.name}: ${type.outward} / ${type.inward}`),
    );
  }

  /** The ticket's issue links, as seen from the ticket. */
  async list(key: string): Promise<LinkView[]> {
    const params = new URLSearchParams({ fields: "issuelinks" });
    const issue = await this.http
      .get<{ fields: { issuelinks?: IssueLink[] } }>(`${issuePath(key)}?${params}`)
      .catch(ticketNotFound(key));
    return (issue.fields.issuelinks ?? []).map(toLinkView);
  }

  /** "<key> <phrase> <other>". Jira returns no id, so the new link is read back from the ticket. */
  async add(key: string, choice: LinkTypeChoice, other: string): Promise<LinkView | undefined> {
    // Jira reads the body as "outwardIssue <inward phrase> inwardIssue", e.g. "KAN-2 is blocked by KAN-1".
    const [from, to] = choice.direction === "outward" ? [key, other] : [other, key];
    await this.http
      .post<undefined>("/rest/api/3/issueLink", {
        type: { id: choice.type.id },
        inwardIssue: { key: from },
        outwardIssue: { key: to },
      })
      .catch(notFoundAs("TICKET_NOT_FOUND", `${key} or ${other} does not exist, or you cannot link them.`));
    const links = await this.list(key);
    return links.find(
      (link) => link.key === other && link.type === choice.type.name && link.direction === choice.direction,
    );
  }

  /** Deletes an issue link, only when it belongs to `key`. */
  async remove(key: string, id: string): Promise<LinkView> {
    const link = (await this.list(key)).find((item) => item.id === id);
    if (!link) throw new CliError("LINK_NOT_FOUND", `${key} has no link ${id}.`);
    await this.http.delete<undefined>(`/rest/api/3/issueLink/${id}`).catch(linkNotFound(key, id));
    return link;
  }
}
