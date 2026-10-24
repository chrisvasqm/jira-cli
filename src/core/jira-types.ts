import { adfToText, type AdfNode } from "./adf.js";

/** Fields `summarize()` reads; every issue request asks for at least these. */
export const ISSUE_LIST_FIELDS = "summary,status,issuetype,priority,assignee,updated";

/** REST path of one issue. */
export function issuePath(key: string): string {
  return `/rest/api/3/issue/${encodeURIComponent(key)}`;
}

/** Minimal Jira issue fields the CLI reads. Extend as commands need more. */
export interface JiraUser {
  accountId: string;
  displayName: string;
}

interface IssueFields {
  summary: string;
  status: { id: string; name: string; statusCategory?: { key: string } };
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

/** Jira's status categories are "new", "indeterminate" (in progress) and "done". */
export function isDone(issue: Issue): boolean {
  return issue.fields.status.statusCategory?.key === "done";
}

interface IssueDetailFields extends IssueFields {
  reporter?: JiraUser | null;
  created: string;
  labels?: string[];
  description?: AdfNode | null;
  parent?: { key: string; fields?: { summary?: string } } | null;
  timetracking?: { originalEstimate?: string; remainingEstimate?: string; timeSpent?: string };
}

export interface IssueDetail extends Issue {
  fields: IssueDetailFields;
}

export interface Comment {
  id: string;
  author?: JiraUser;
  body?: AdfNode;
  created: string;
  updated: string;
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

export interface CommentView {
  id: string;
  author: string | null;
  created: string;
  updated: string;
  body: string;
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

export function toCommentView(comment: Comment): CommentView {
  return {
    id: comment.id,
    author: comment.author?.displayName ?? null,
    created: comment.created,
    updated: comment.updated,
    body: adfToText(comment.body),
  };
}
