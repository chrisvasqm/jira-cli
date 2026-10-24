import { ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { issuePath } from "../core/jira-types.js";

export interface Transition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

/** /rest/api/3/issue/{key}/transitions: the status changes the workflow allows right now. */
export class TransitionService {
  constructor(private readonly http = HttpClient.get()) {}

  async list(key: string): Promise<Transition[]> {
    const page = await this.http
      .get<{ transitions: Transition[] }>(this.path(key))
      .catch(ticketNotFound(key));
    return page.transitions;
  }

  async apply(key: string, transitionId: string): Promise<void> {
    await this.http
      .post<undefined>(this.path(key), { transition: { id: transitionId } })
      .catch(ticketNotFound(key));
  }

  private path(key: string): string {
    return `${issuePath(key)}/transitions`;
  }
}
