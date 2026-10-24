import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";

interface LabelPage {
  values: string[];
  total?: number;
  isLast?: boolean;
}

/** /rest/api/3/label: labels used anywhere on the site. */
export class LabelService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Up to `limit` labels. */
  list(limit: number): Promise<Collected<string>> {
    return collectPages<string>(
      async (startAt, maxResults) => {
        const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(maxResults) });
        const page = await this.http.get<LabelPage>(`/rest/api/3/label?${params}`);
        return { items: page.values, total: page.total, isLast: page.isLast };
      },
      limit,
      1000,
    );
  }
}
