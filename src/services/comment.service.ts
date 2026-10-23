import { adfToText } from "../core/adf.js";
import { HttpClient } from "../core/http.js";
import type { Comment, CommentView } from "../core/jira-types.js";

interface CommentPage {
  comments: Comment[];
  total: number;
  startAt: number;
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

/** /rest/api/3/issue/{key}/comment endpoints. */
export class CommentService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Newest `limit` comments, returned oldest first so they read like a conversation. */
  async latest(key: string, limit: number): Promise<{ comments: Comment[]; total: number }> {
    if (limit === 0) {
      const page = await this.page(key, 0, 0, "-created");
      return { comments: [], total: page.total };
    }
    const page = await this.page(key, 0, limit, "-created");
    return { comments: page.comments.toReversed(), total: page.total };
  }

  private page(key: string, startAt: number, maxResults: number, orderBy: string): Promise<CommentPage> {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(maxResults), orderBy });
    return this.http.get<CommentPage>(`/rest/api/3/issue/${encodeURIComponent(key)}/comment?${params}`);
  }
}
