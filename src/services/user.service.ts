import { CliError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { JiraUser } from "../core/jira-types.js";
import { sameName } from "../core/text.js";

interface Myself {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

interface FoundUser extends JiraUser {
  emailAddress?: string;
  active?: boolean;
  accountType?: string;
}

/** /rest/api/3/myself and user lookups. */
export class UserService {
  constructor(private readonly http = HttpClient.get()) {}

  myself(): Promise<Myself> {
    return this.http.get<Myself>("/rest/api/3/myself");
  }

  /** "me", an accountId, or an email or name to search for. */
  async resolve(who: string): Promise<JiraUser> {
    if (who === "me") return this.myself();
    if (looksLikeAccountId(who)) return { accountId: who, displayName: who };
    const params = new URLSearchParams({ query: who, maxResults: String(SEARCH_LIMIT) });
    const found = await this.http.get<FoundUser[]>(`/rest/api/3/user/search?${params}`);
    const people = found.filter((user) => user.active !== false && user.accountType !== "app");
    // The search matches prefixes, so prefer the one exact email or name match.
    const exact = people.filter(
      (user) => sameName(user.emailAddress, who) || sameName(user.displayName, who),
    );
    const [match, ...others] = exact.length === 1 ? exact : people;
    if (!match) throw new CliError("USER_NOT_FOUND", `No active Jira user matches "${who}"`);
    if (others.length > 0) {
      const names = people.map((user) => `${user.displayName} (${user.accountId})`);
      const count = found.length >= SEARCH_LIMIT ? `${SEARCH_LIMIT} or more` : String(people.length);
      throw new CliError(
        "USER_AMBIGUOUS",
        `"${who}" matches ${count} users; use an email or accountId`,
        names,
      );
    }
    return { accountId: match.accountId, displayName: match.displayName };
  }
}

const SEARCH_LIMIT = 10;

/** Cloud accountIds look like "557058:3f1c…" or a 24-character hex id. */
function looksLikeAccountId(who: string): boolean {
  return /^\d+:[0-9a-f-]{8,}$/i.test(who) || /^[0-9a-f]{24}$/i.test(who);
}
