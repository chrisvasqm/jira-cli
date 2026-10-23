import { adfToText } from "../core/adf.js";
import { HttpClient } from "../core/http.js";
import type { Comment, CommentView } from "../core/jira-types.js";

interface CommentPage {
  comments: Comment[];
  total: number;
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

  /** Newest `limit` (>= 1) comments, returned oldest first so they read like a conversation. */
  async latest(key: string, limit: number): Promise<{ comments: Comment[]; total: number }> {
    const params = new URLSearchParams({ startAt: "0", maxResults: String(limit), orderBy: "-created" });
    const page = await this.http.get<CommentPage>(
      `/rest/api/3/issue/${encodeURIComponent(key)}/comment?${params}`,
    );
    return { comments: page.comments.toReversed(), total: page.total };
  }
}
