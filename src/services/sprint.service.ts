import { CliError, notFoundAs, ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { boardNotFound, type Sprint } from "./board.service.js";

export interface SprintInput {
  name: string;
  goal?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export type SprintUpdate = Partial<SprintInput> & { state?: "active" | "closed" };

/** Jira's 400 for a kanban or simple board; narrower than other sprint errors (e.g. the name limit). */
const doesNotSupportSprints = (details: unknown): boolean =>
  /does not support sprints/i.test(JSON.stringify(details ?? ""));

const sprintNotFound = (sprintId: number) =>
  notFoundAs("SPRINT_NOT_FOUND", `Sprint ${sprintId} does not exist or you cannot see it.`);

/** /rest/agile/1.0 sprint, backlog and agile issue endpoints. */
export class SprintService {
  constructor(private readonly http = HttpClient.get()) {}

  get(sprintId: number): Promise<Sprint> {
    return this.http.get<Sprint>(`/rest/agile/1.0/sprint/${sprintId}`).catch(sprintNotFound(sprintId));
  }

  /** A new future sprint on the board; Jira answers 400 when the board does not use sprints. */
  create(boardId: number, input: SprintInput): Promise<Sprint> {
    return this.http
      .post<Sprint>("/rest/agile/1.0/sprint", { ...input, originBoardId: boardId })
      .catch((err: unknown) => {
        if (err instanceof CliError && err.status === 400 && doesNotSupportSprints(err.details)) {
          throw new CliError("NO_SPRINTS", `Board ${boardId} does not use sprints.`, err.details);
        }
        return boardNotFound(boardId)(err);
      });
  }

  /** Changes only the fields given; `state` starts (active) or closes (closed) the sprint. */
  update(sprintId: number, input: SprintUpdate): Promise<Sprint> {
    return this.http
      .post<Sprint>(`/rest/agile/1.0/sprint/${sprintId}`, input)
      .catch(sprintNotFound(sprintId));
  }

  async remove(sprintId: number): Promise<void> {
    await this.http.delete<undefined>(`/rest/agile/1.0/sprint/${sprintId}`).catch(sprintNotFound(sprintId));
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
