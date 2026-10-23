import { ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { IssueDetail } from "../core/jira-types.js";
import { ISSUE_LIST_FIELDS } from "./board.service.js";

const ISSUE_DETAIL_FIELDS = `${ISSUE_LIST_FIELDS},reporter,created,labels,description,parent`;

/** /rest/api/3/issue endpoints. */
export class IssueService {
  constructor(private readonly http = HttpClient.get()) {}

  get(key: string): Promise<IssueDetail> {
    const params = new URLSearchParams({ fields: ISSUE_DETAIL_FIELDS });
    return this.http
      .get<IssueDetail>(`/rest/api/3/issue/${encodeURIComponent(key)}?${params}`)
      .catch(ticketNotFound(key));
  }
}
