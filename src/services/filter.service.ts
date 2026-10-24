import { CliError, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { JiraUser } from "../core/jira-types.js";
import { sameName } from "../core/text.js";

export interface Filter {
  id: string;
  name: string;
  jql: string;
  owner?: JiraUser;
  favourite?: boolean;
}

interface FilterPage {
  values: Filter[];
}

/** Longest list of name matches read before a name is called ambiguous. */
const SEARCH_LIMIT = 50;

/** /rest/api/3/filter endpoints. */
export class FilterService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Filters you own plus your favourites. */
  mine(): Promise<Filter[]> {
    return this.http.get<Filter[]>("/rest/api/3/filter/my?includeFavourites=true");
  }

  /** A filter id, or a filter name (case does not matter). */
  resolve(wanted: string): Promise<Filter> {
    const text = wanted.trim();
    return /^\d+$/.test(text) ? this.get(text) : this.byName(text);
  }

  private get(id: string): Promise<Filter> {
    const message = `Filter ${id} does not exist or you cannot see it.`;
    return this.http.get<Filter>(`/rest/api/3/filter/${id}`).catch((err: unknown) => {
      // Jira answers 400 for a filter that exists but is not shared with you.
      if (err instanceof CliError && err.status === 400) throw new CliError("FILTER_NOT_FOUND", message);
      return notFoundAs("FILTER_NOT_FOUND", message)(err);
    });
  }

  private async byName(name: string): Promise<Filter> {
    const params = new URLSearchParams({
      filterName: name,
      expand: "jql,owner,favourite",
      maxResults: String(SEARCH_LIMIT),
    });
    const page = await this.http.get<FilterPage>(`/rest/api/3/filter/search?${params}`);
    // filterName matches parts of names, so keep only the exact ones.
    const matches = page.values.filter((filter) => sameName(filter.name, name));
    const [match, ...others] = matches;
    const options = page.values.map((filter) => ({ id: filter.id, name: filter.name }));
    if (!match) throw new CliError("FILTER_NOT_FOUND", `No filter you can see is named "${name}".`, options);
    if (others.length > 0) {
      throw new CliError(
        "FILTER_AMBIGUOUS",
        `"${name}" matches ${matches.length} filters; pass a filter id.`,
        matches.map((filter) => ({ id: filter.id, name: filter.name, owner: filter.owner?.displayName })),
      );
    }
    return match;
  }
}
