import { CliError, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { JiraUser } from "../core/jira-types.js";
import { sameName } from "../core/text.js";

interface Myself {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

/** A user as /user/search and /user return it; the email shows only when the profile allows. */
export interface FoundUser extends JiraUser {
  emailAddress?: string;
  active?: boolean;
  accountType?: string;
  timeZone?: string;
}

/** /rest/api/3/myself and user lookups. */
export class UserService {
  constructor(private readonly http = HttpClient.get()) {}

  myself(): Promise<Myself> {
    return this.http.get<Myself>("/rest/api/3/myself");
  }

  /** One user by accountId; USER_NOT_FOUND when Jira has no such account. */
  get(accountId: string): Promise<FoundUser> {
    const params = new URLSearchParams({ accountId });
    return this.http
      .get<FoundUser>(`/rest/api/3/user?${params}`)
      .catch(notFoundAs("USER_NOT_FOUND", `No Jira user has accountId "${accountId}"`));
  }

  /**
   * Active people whose name or email starts with `text`, at most `limit`.
   * With `project`, only people who can be assigned tickets in that project.
   */
  async search(text: string, limit: number, project?: string): Promise<FoundUser[]> {
    const params = new URLSearchParams({ query: text, maxResults: String(limit) });
    let path = "/rest/api/3/user/search";
    if (project !== undefined) {
      params.set("project", project);
      path = "/rest/api/3/user/assignable/search";
    }
    const request = this.http.get<FoundUser[]>(`${path}?${params}`);
    const found = await (project === undefined
      ? request
      : request.catch(
          notFoundAs("PROJECT_NOT_FOUND", `Project ${project} does not exist or you cannot see it.`),
        ));
    return found.filter(isPerson);
  }

  /** "me", an accountId, or an email or name to search for. */
  async resolve(who: string): Promise<JiraUser> {
    if (who === "me") return this.myself();
    if (looksLikeAccountId(who)) return { accountId: who, displayName: who };
    const params = new URLSearchParams({ query: who, maxResults: String(SEARCH_LIMIT) });
    const found = await this.http.get<FoundUser[]>(`/rest/api/3/user/search?${params}`);
    const people = found.filter(isPerson);
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

/** Active human accounts: not deactivated, not an app or bot. */
function isPerson(user: FoundUser): boolean {
  return user.active !== false && user.accountType !== "app";
}

/** Cloud accountIds look like "557058:3f1c…" or a 24-character hex id. */
function looksLikeAccountId(who: string): boolean {
  return /^\d+:[0-9a-f-]{8,}$/i.test(who) || /^[0-9a-f]{24}$/i.test(who);
}
