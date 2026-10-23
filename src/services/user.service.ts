import { CliError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { JiraUser } from "../core/jira-types.js";

export interface Myself {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

interface FoundUser extends JiraUser {
  active?: boolean;
  accountType?: string;
}

/** /rest/api/3/myself and user lookups. */
export class UserService {
  constructor(private readonly http = HttpClient.get()) {}

  myself(): Promise<Myself> {
    return this.http.get<Myself>("/rest/api/3/myself");
  }

  /** "me", an email/name to search, or an accountId (anything without "@" or spaces that has a ":" or 24+ chars). */
  async resolve(who: string): Promise<JiraUser> {
    if (who === "me") return this.myself();
    if (looksLikeAccountId(who)) return { accountId: who, displayName: who };
    const params = new URLSearchParams({ query: who, maxResults: "10" });
    const found = await this.http.get<FoundUser[]>(`/rest/api/3/user/search?${params}`);
    const people = found.filter((user) => user.active !== false && user.accountType !== "app");
    const [match, ...others] = people;
    if (!match) throw new CliError("USER_NOT_FOUND", `No active Jira user matches "${who}"`);
    if (others.length > 0) {
      const names = people.map((user) => `${user.displayName} (${user.accountId})`);
      throw new CliError(
        "USER_AMBIGUOUS",
        `"${who}" matches ${people.length} users; use an email or accountId`,
        names,
      );
    }
    return { accountId: match.accountId, displayName: match.displayName };
  }
}

function looksLikeAccountId(who: string): boolean {
  if (who.includes("@") || /\s/.test(who)) return false;
  return who.includes(":") || /^[0-9a-f]{24}$/i.test(who);
}
