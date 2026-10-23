import { ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { Comment } from "../core/jira-types.js";

export interface CommentPage {
  comments: Comment[];
  total: number;
}

/** /rest/api/3/issue/{key}/comment endpoints. */
export class CommentService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Newest `limit` (>= 1) comments, returned oldest first so they read like a conversation. */
  async latest(key: string, limit: number): Promise<CommentPage> {
    const params = new URLSearchParams({ startAt: "0", maxResults: String(limit), orderBy: "-created" });
    const page = await this.http
      .get<CommentPage>(`/rest/api/3/issue/${encodeURIComponent(key)}/comment?${params}`)
      .catch(ticketNotFound(key));
    return { comments: page.comments.toReversed(), total: page.total };
  }
}
