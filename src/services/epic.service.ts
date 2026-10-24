import { CliError, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { ISSUE_LIST_FIELDS, issuePath, isDone, type Issue } from "../core/jira-types.js";
import { ProjectService } from "./project.service.js";
import { SearchService } from "./search.service.js";

/** Epics sit one level above standard issue types in both company- and team-managed projects. */
const EPIC_LEVEL = 1;

export interface Progress {
  done: number;
  total: number;
}

/** An issue with its parent key, as `parent` searches return it. */
export interface ChildIssue extends Issue {
  fields: Issue["fields"] & { parent?: { key: string } | null };
}

/** An epic and its children: GET /issue/{key}, and search with `parent in (…)`. */
export class EpicService {
  constructor(
    private readonly http = HttpClient.get(),
    private readonly search = new SearchService(),
    private readonly projects = new ProjectService(),
  ) {}

  /** EPIC_NOT_FOUND when the key is missing; NOT_AN_EPIC when the ticket is another type. */
  async get(key: string): Promise<Issue> {
    const params = new URLSearchParams({ fields: ISSUE_LIST_FIELDS });
    const issue = await this.http
      .get<Issue>(`${issuePath(key)}?${params}`)
      .catch(notFoundAs("EPIC_NOT_FOUND", `Epic ${key} does not exist or you cannot see it.`));
    const type = issue.fields.issuetype;
    if (!isEpic(type)) {
      throw new CliError("NOT_AN_EPIC", `${issue.key} is a ${type.name}, not an epic.`, {
        key: issue.key,
        type: type.name,
      });
    }
    return issue;
  }

  /** Ids of the project's epic-level issue types, whatever the site named them; [] when it has none. */
  async typeIds(project: string): Promise<string[]> {
    const types = await this.projects.issueTypes(project);
    return types.filter(isEpic).map((type) => type.id);
  }

  /** Children of the given epics, oldest first. hasMore: more than `limit` exist. */
  async children(keys: string[], limit: number): Promise<{ issues: ChildIssue[]; hasMore: boolean }> {
    if (keys.length === 0) return { issues: [], hasMore: false };
    const jql = `parent in (${keys.join(", ")}) ORDER BY created ASC`;
    const found = await this.search.search(jql, [...ISSUE_LIST_FIELDS.split(","), "parent"], { limit });
    return { issues: found.issues as unknown as ChildIssue[], hasMore: found.hasMore };
  }
}

/** hierarchyLevel marks an epic even when the site renamed the type; the name is the fallback. */
function isEpic(type: { name: string; hierarchyLevel?: number }): boolean {
  return type.hierarchyLevel === undefined
    ? type.name.toLowerCase() === "epic"
    : type.hierarchyLevel === EPIC_LEVEL;
}

/** Done (status category done) and total children. */
export function progressOf(children: Issue[]): Progress {
  return { done: children.filter(isDone).length, total: children.length };
}
