import { CliError, ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { issuePath, type JiraUser } from "../core/jira-types.js";

export interface Watchers {
  isWatching: boolean;
  watchCount: number;
  watchers: JiraUser[];
}

/** /rest/api/3/issue/{key}/watchers endpoints. */
export class WatcherService {
  constructor(private readonly http = HttpClient.get()) {}

  list(key: string): Promise<Watchers> {
    return this.http.get<Watchers>(this.path(key)).catch(watchErrors(key));
  }

  /** Jira takes the accountId as a bare JSON string. */
  async add(key: string, accountId: string): Promise<void> {
    await this.http.post<undefined>(this.path(key), accountId).catch(watchErrors(key, accountId));
  }

  async remove(key: string, accountId: string): Promise<void> {
    const params = new URLSearchParams({ accountId });
    await this.http.delete<undefined>(`${this.path(key)}?${params}`).catch(watchErrors(key, accountId));
  }

  private path(key: string): string {
    return `${issuePath(key)}/watchers`;
  }
}

/**
 * Watching turned off in Jira's general configuration → WATCHING_DISABLED. A 404 names
 * the user when one is given (callers read the watchers first, so the ticket exists).
 */
function watchErrors(key: string, accountId?: string): (err: unknown) => never {
  return (err: unknown) => {
    if (err instanceof CliError && /watch[\w\s]*disabled/i.test(JSON.stringify(err.details ?? ""))) {
      throw new CliError(
        "WATCHING_DISABLED",
        "Watching is turned off on this Jira site (Allow users to watch issues).",
        err.details,
      );
    }
    if (accountId && err instanceof CliError && err.code === "NOT_FOUND") {
      throw new CliError("USER_NOT_FOUND", `No Jira user with accountId ${accountId} can watch ${key}`);
    }
    return ticketNotFound(key)(err);
  };
}
