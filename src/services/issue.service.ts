import { ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { explainTimeTracking } from "./worklog.service.js";
import { ISSUE_LIST_FIELDS, issuePath, type IssueDetail } from "../core/jira-types.js";

export interface IssueEdit {
  fields: Record<string, unknown>;
  update: Record<string, unknown[]>;
}

const ISSUE_DETAIL_FIELDS = `${ISSUE_LIST_FIELDS},reporter,created,labels,description,parent,timetracking`;

/** /rest/api/3/issue endpoints. */
export class IssueService {
  constructor(private readonly http = HttpClient.get()) {}

  get(key: string): Promise<IssueDetail> {
    const params = new URLSearchParams({ fields: ISSUE_DETAIL_FIELDS });
    return this.http.get<IssueDetail>(`${issuePath(key)}?${params}`).catch(ticketNotFound(key));
  }

  /** POST /issue. `fields` must hold project, issuetype and summary. */
  create(edit: IssueEdit): Promise<{ id: string; key: string }> {
    return this.http.post<{ id: string; key: string }>("/rest/api/3/issue", edit).catch(explainTimeTracking);
  }

  /** PUT /issue/{key}: `fields` sets values, `update` applies operations such as label add/remove. */
  async update(key: string, edit: IssueEdit): Promise<void> {
    await this.http
      .put<undefined>(issuePath(key), edit)
      .catch(ticketNotFound(key))
      .catch(explainTimeTracking);
  }

  /** DELETE /issue/{key}. Jira refuses when the ticket has sub-tasks unless `withSubtasks`. */
  async remove(key: string, withSubtasks: boolean): Promise<void> {
    const params = new URLSearchParams({ deleteSubtasks: String(withSubtasks) });
    await this.http.delete<undefined>(`${issuePath(key)}?${params}`).catch(ticketNotFound(key));
  }
}
