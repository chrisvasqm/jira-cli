import { CliError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { ISSUE_LIST_FIELDS, type Issue } from "../core/jira-types.js";

export interface ChangeItem {
  field: string;
  from: string | null;
  to: string | null;
}

export interface History {
  created: string;
  items: ChangeItem[];
}

export interface SearchIssue {
  key: string;
  fields: Record<string, unknown> & {
    summary?: string;
    created?: string;
    status?: { id: string; name: string; statusCategory?: { key: string } };
    assignee?: { displayName: string } | null;
    statuscategorychangedate?: string | null;
  };
  changelog?: { histories: History[] };
}

interface SearchPage {
  issues: SearchIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

interface Status {
  id: string;
  statusCategory: { key: string };
}

/** POST /rest/api/3/search/jql, which pages with nextPageToken. */
export class SearchService {
  constructor(private readonly http = HttpClient.get()) {}

  async search(
    jql: string,
    fields: string[],
    options: { limit: number; changelog?: boolean },
  ): Promise<{ issues: SearchIssue[]; hasMore: boolean }> {
    const issues: SearchIssue[] = [];
    let nextPageToken: string | undefined;
    for (;;) {
      const body: Record<string, unknown> = {
        jql,
        fields,
        maxResults: Math.min(100, options.limit - issues.length),
      };
      if (options.changelog) body["expand"] = "changelog";
      if (nextPageToken) body["nextPageToken"] = nextPageToken;
      const page = await this.http.post<SearchPage>("/rest/api/3/search/jql", body).catch(jqlInvalid);
      issues.push(...page.issues);
      nextPageToken = page.nextPageToken;
      const more = Boolean(nextPageToken) && page.isLast !== true && page.issues.length > 0;
      if (!more || issues.length >= options.limit) return { issues, hasMore: more };
    }
  }

  /** Issues with the fields `summarize()` reads. */
  async issues(jql: string, limit: number): Promise<{ issues: Issue[]; hasMore: boolean }> {
    const found = await this.search(jql, ISSUE_LIST_FIELDS.split(","), { limit });
    return { issues: found.issues as unknown as Issue[], hasMore: found.hasMore };
  }

  /** Status id → category key ("new", "indeterminate", "done"), to read changelog transitions. */
  async statusCategories(): Promise<Map<string, string>> {
    const statuses = await this.http.get<Status[]>("/rest/api/3/status");
    return new Map(statuses.map((status) => [status.id, status.statusCategory.key]));
  }
}

/** Jira answers 400 when the JQL does not parse or names an unknown field, value or function. */
function jqlInvalid(err: unknown): never {
  if (err instanceof CliError && err.status === 400) {
    throw new CliError("JQL_INVALID", "Jira rejected the JQL query.", err.details);
  }
  throw err;
}
