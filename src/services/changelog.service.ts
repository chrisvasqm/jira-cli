import { ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages } from "../core/paging.js";
import { issuePath, type JiraUser } from "../core/jira-types.js";

export interface ChangelogItem {
  field: string;
  fromString?: string | null;
  toString?: string | null;
}

export interface Changelog {
  id: string;
  /** Missing for some automated or anonymous changes. */
  author?: JiraUser;
  created: string;
  items: ChangelogItem[];
}

interface ChangelogPage {
  values: Changelog[];
  total: number;
  isLast?: boolean;
}

export interface ChangelogEntry {
  /** Newest first. */
  entries: Changelog[];
  total: number;
}

/** Jira returns at most 100 changelogs per page. */
const PAGE_SIZE = 100;

/** /rest/api/3/issue/{key}/changelog. Jira lists it oldest first and cannot sort it. */
export class ChangelogService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Newest `limit` (>= 1) changelogs, newest first. */
  async latest(key: string, limit: number): Promise<ChangelogEntry> {
    // Most tickets fit in one page; otherwise its total tells where the newest page starts.
    const first = await this.page(key, 0, PAGE_SIZE);
    if (first.isLast === true || first.values.length >= first.total) {
      return { entries: first.values.slice(-limit).toReversed(), total: first.total };
    }
    const offset = Math.max(0, first.total - limit);
    const rest = await collectPages<Changelog>(
      async (startAt, maxResults) => {
        const page = await this.page(key, offset + startAt, maxResults);
        return { items: page.values, total: page.total - offset, isLast: page.isLast };
      },
      first.total - offset,
      PAGE_SIZE,
    );
    return { entries: rest.items.toReversed(), total: first.total };
  }

  private page(key: string, startAt: number, maxResults: number): Promise<ChangelogPage> {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(maxResults) });
    return this.http.get<ChangelogPage>(`${issuePath(key)}/changelog?${params}`).catch(ticketNotFound(key));
  }
}
