import { notFoundAs, ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { Sprint } from "./board.service.js";

/** /rest/agile/1.0 sprint, backlog and agile issue endpoints. */
export class SprintService {
  constructor(private readonly http = HttpClient.get()) {}

  get(sprintId: number): Promise<Sprint> {
    return this.http
      .get<Sprint>(`/rest/agile/1.0/sprint/${sprintId}`)
      .catch(notFoundAs("SPRINT_NOT_FOUND", `Sprint ${sprintId} does not exist or you cannot see it.`));
  }

  /** Moves the ticket into the sprint (out of any other open sprint). */
  async add(sprintId: number, key: string): Promise<void> {
    await this.http
      .post<undefined>(`/rest/agile/1.0/sprint/${sprintId}/issue`, { issues: [key] })
      .catch(ticketNotFound(key));
  }

  /** Moves the ticket out of its sprint, back to the backlog. */
  async toBacklog(key: string): Promise<void> {
    await this.http
      .post<undefined>("/rest/agile/1.0/backlog/issue", { issues: [key] })
      .catch(ticketNotFound(key));
  }

  /** The ticket's open sprint, or null when it has none. */
  async ofIssue(key: string): Promise<Sprint | null> {
    const issue = await this.http
      .get<{ fields: { sprint?: Sprint | null } }>(
        `/rest/agile/1.0/issue/${encodeURIComponent(key)}?fields=sprint`,
      )
      .catch(ticketNotFound(key));
    return issue.fields.sprint ?? null;
  }
}
