import { CliError } from "../core/errors.js";
import { HttpClient } from "../core/http.js";

/** Jira ranks at most this many tickets per request. */
export const MAX_RANK = 50;

/** Where the tickets go: right before or right after the target ticket. */
export type RankTarget = { before: string } | { after: string };

/** One ticket Jira could not rank, from its 207 Multi-Status answer. */
export interface RankFailure {
  key: string;
  status: number;
  message: string;
}

interface RankEntry {
  issueKey: string;
  status: number;
  errors?: string[];
}

/** PUT /rest/agile/1.0/issue/rank: backlog order on the default rank field. */
export class RankService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Moves `keys` (in this order) next to the target; returns the tickets Jira did not rank. */
  async rank(keys: string[], target: RankTarget): Promise<RankFailure[]> {
    const position =
      "before" in target ? { rankBeforeIssue: target.before } : { rankAfterIssue: target.after };
    // 204 (no body) when every ticket moved; 207 lists a status per ticket otherwise.
    const answer = await this.http
      .put<{ entries?: RankEntry[] } | undefined>("/rest/agile/1.0/issue/rank", {
        issues: keys,
        ...position,
      })
      .catch(unknownTicket(keys, target));
    return (answer?.entries ?? [])
      .filter((entry) => entry.status >= 300)
      .map((entry) => ({
        key: entry.issueKey,
        status: entry.status,
        message: entry.errors?.join(" ") || `Jira answered ${entry.status}`,
      }));
  }
}

/** Jira's 400 for a missing ticket; it names moved keys in `errors` and a missing target in `errorMessages`. */
function unknownTicket(keys: string[], target: RankTarget): (err: unknown) => never {
  return (err: unknown) => {
    if (!(err instanceof CliError) || err.status !== 400) throw err;
    const details = (err.details ?? {}) as { errorMessages?: string[]; errors?: Record<string, string> };
    const missing = [
      ...Object.keys(details.errors ?? {}).filter((key) => keys.includes(key)),
      ...((details.errorMessages ?? []).some((text) => /does not exist/i.test(text))
        ? ["before" in target ? target.before : target.after]
        : []),
    ];
    if (missing.length === 0) throw err;
    throw new CliError(
      "TICKET_NOT_FOUND",
      `Nothing was ranked: ${missing.join(", ")} does not exist or you cannot see it.`,
      err.details,
    );
  };
}
