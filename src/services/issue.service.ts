import { HttpClient } from "../core/http.js";
import type { IssueDetail } from "../core/jira-types.js";

export const ISSUE_DETAIL_FIELDS =
  "summary,status,issuetype,priority,assignee,reporter,created,updated,labels,description,parent";

/** /rest/api/3/issue endpoints. */
export class IssueService {
  constructor(private readonly http = HttpClient.get()) {}

  get(key: string): Promise<IssueDetail> {
    return this.http.get<IssueDetail>(
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${ISSUE_DETAIL_FIELDS}`,
    );
  }
}
