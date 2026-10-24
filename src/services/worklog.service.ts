import type { AdfNode } from "../core/adf.js";
import { CliError, notFoundAs, ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages } from "../core/paging.js";
import { issuePath, type JiraUser } from "../core/jira-types.js";

export interface Worklog {
  id: string;
  author?: JiraUser;
  comment?: AdfNode;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
}

interface WorklogPage {
  worklogs: Worklog[];
  total: number;
}

export interface NewWorklog {
  /** Jira duration, e.g. "2h 30m". */
  timeSpent: string;
  /** ISO timestamp; sent in the form Jira's worklog API accepts. */
  started: string;
  comment?: AdfNode | undefined;
}

const PAGE_SIZE = 100;

/** Jira wants "2026-10-24T08:13:00.000+0000": a numeric offset, not "Z". */
function jiraTime(iso: string): string {
  return new Date(iso).toISOString().replace("Z", "+0000");
}

/** True when the site has time tracking switched off (GET /configuration, any signed-in user). */
export async function timeTrackingDisabled(http = HttpClient.get()): Promise<boolean> {
  const config = await http
    .get<{ timeTrackingEnabled?: boolean }>("/rest/api/3/configuration")
    .catch(() => undefined);
  return config?.timeTrackingEnabled === false;
}

function timeTrackingError(): CliError {
  return new CliError("TIME_TRACKING_DISABLED", "Time tracking is turned off on this Jira site.");
}

/**
 * Catch handler for ticket writes: Jira refuses the timetracking field (400) when time
 * tracking is off, and also when the field is not on the screen, so the site settings decide.
 */
export async function explainTimeTracking(err: unknown): Promise<never> {
  const errors = err instanceof CliError && err.code === "JIRA_ERROR" ? jiraFieldErrors(err.details) : {};
  if ("timetracking" in errors && (await timeTrackingDisabled())) throw timeTrackingError();
  throw err;
}

function jiraFieldErrors(details: unknown): Record<string, unknown> {
  const errors =
    typeof details === "object" && details !== null ? (details as { errors?: unknown }).errors : undefined;
  return typeof errors === "object" && errors !== null ? (errors as Record<string, unknown>) : {};
}

/**
 * Jira answers 404 for a missing ticket or worklog and also when time tracking is off,
 * so a 404 is checked against the site settings before `fallback` names the missing thing.
 */
function worklogNotFound(fallback: (err: unknown) => never): (err: unknown) => Promise<never> {
  return async (err: unknown) => {
    if (err instanceof CliError && err.code === "NOT_FOUND" && (await timeTrackingDisabled())) {
      throw timeTrackingError();
    }
    return fallback(err);
  };
}

/** /rest/api/3/issue/{key}/worklog endpoints. */
export class WorklogService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Oldest first, up to `limit` worklogs. */
  async list(key: string, limit: number): Promise<WorklogPage> {
    const result = await collectPages<Worklog>(
      async (startAt, maxResults) => {
        const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(maxResults) });
        const page = await this.http
          .get<WorklogPage>(`${this.path(key)}?${params}`)
          .catch(worklogNotFound(ticketNotFound(key)));
        return { items: page.worklogs, total: page.total };
      },
      limit,
      PAGE_SIZE,
    );
    return { worklogs: result.items, total: result.total ?? result.items.length };
  }

  /** Jira lowers the remaining estimate by the time spent (adjustEstimate=auto). */
  add(key: string, worklog: NewWorklog): Promise<Worklog> {
    const body = { ...worklog, started: jiraTime(worklog.started) };
    return this.http.post<Worklog>(this.path(key), body).catch(worklogNotFound(ticketNotFound(key)));
  }

  async remove(key: string, id: string): Promise<void> {
    const missing = notFoundAs(
      "WORKLOG_NOT_FOUND",
      `Worklog #${id} on ${key} does not exist, or the ticket does not.`,
    );
    await this.http.delete<undefined>(`${this.path(key)}/${id}`).catch(worklogNotFound(missing));
  }

  private path(key: string): string {
    return `${issuePath(key)}/worklog`;
  }
}
