/** Minimal Jira issue fields the CLI reads. Extend as commands need more. */
export interface JiraUser {
  accountId: string;
  displayName: string;
}

export interface IssueFields {
  summary: string;
  status: { id: string; name: string };
  issuetype: { name: string };
  priority?: { name: string } | null;
  assignee?: JiraUser | null;
  updated: string;
}

export interface Issue {
  id: string;
  key: string;
  fields: IssueFields;
}

export interface IssueSummary {
  key: string;
  type: string;
  summary: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  updated: string;
}

export function summarize(issue: Issue): IssueSummary {
  const { fields } = issue;
  return {
    key: issue.key,
    type: fields.issuetype.name,
    summary: fields.summary,
    status: fields.status.name,
    priority: fields.priority?.name ?? null,
    assignee: fields.assignee?.displayName ?? null,
    updated: fields.updated,
  };
}
