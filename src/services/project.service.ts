import { notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { JiraUser } from "../core/jira-types.js";
import { collectPages, type Collected } from "../core/paging.js";

export interface Project {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  lead?: JiraUser;
}

export interface Component {
  id: string;
  name: string;
  description?: string;
  lead?: JiraUser;
}

export interface IssueType {
  id: string;
  name: string;
  hierarchyLevel?: number;
}

export interface Version {
  id: string;
  name: string;
  released?: boolean;
  archived?: boolean;
  releaseDate?: string;
}

interface ProjectPage {
  values: Project[];
  total?: number;
  isLast?: boolean;
}

function projectNotFound(key: string): (err: unknown) => never {
  return notFoundAs("PROJECT_NOT_FOUND", `Project ${key} does not exist or you cannot see it.`);
}

/** /rest/api/3/project endpoints: projects and their components and versions. */
export class ProjectService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Projects you can see, by key, up to `limit`. */
  search(limit: number): Promise<Collected<Project>> {
    return collectPages<Project>(
      async (startAt, maxResults) => {
        const params = new URLSearchParams({
          startAt: String(startAt),
          maxResults: String(maxResults),
          orderBy: "key",
          expand: "lead",
        });
        const page = await this.http.get<ProjectPage>(`/rest/api/3/project/search?${params}`);
        return { items: page.values, total: page.total, isLast: page.isLast };
      },
      limit,
      100,
    );
  }

  /** The project's issue types; hierarchyLevel is 1 for epics, 0 for standard types, -1 for sub-tasks. */
  async issueTypes(key: string): Promise<IssueType[]> {
    const project = await this.http
      .get<{ issueTypes?: IssueType[] }>(this.path(key))
      .catch(projectNotFound(key));
    return project.issueTypes ?? [];
  }

  /** Every component of the project (Jira does not page this list). */
  components(key: string): Promise<Component[]> {
    return this.http.get<Component[]>(`${this.path(key)}/components`).catch(projectNotFound(key));
  }

  /** Every version of the project, in the project's order (Jira does not page this list). */
  versions(key: string): Promise<Version[]> {
    return this.http.get<Version[]>(`${this.path(key)}/versions`).catch(projectNotFound(key));
  }

  private path(key: string): string {
    return `/rest/api/3/project/${encodeURIComponent(key)}`;
  }
}
