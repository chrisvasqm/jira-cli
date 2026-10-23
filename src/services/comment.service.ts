import type { AdfNode } from "../core/adf.js";
import { ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import type { Comment } from "../core/jira-types.js";

export interface CommentPage {
  comments: Comment[];
  total: number;
}

/** Jira returns at most 100 comments per page. */
const PAGE_SIZE = 100;

/** /rest/api/3/issue/{key}/comment endpoints. */
export class CommentService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Newest `limit` (>= 1) comments, returned oldest first so they read like a conversation. */
  async latest(key: string, limit: number): Promise<CommentPage> {
    const page = await this.page(key, 0, limit, "-created");
    return { comments: page.comments.toReversed(), total: page.total };
  }

  /** Oldest first, up to `limit` comments, following pages as needed. */
  async list(key: string, limit: number): Promise<CommentPage> {
    const comments: Comment[] = [];
    let total = 0;
    do {
      const page = await this.page(
        key,
        comments.length,
        Math.min(PAGE_SIZE, limit - comments.length),
        "created",
      );
      comments.push(...page.comments);
      total = page.total;
      if (page.comments.length === 0) break;
    } while (comments.length < Math.min(limit, total));
    return { comments, total };
  }

  add(key: string, body: AdfNode): Promise<Comment> {
    return this.http.post<Comment>(this.path(key), { body }).catch(ticketNotFound(key));
  }

  private page(key: string, startAt: number, maxResults: number, orderBy: string): Promise<CommentPage> {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(maxResults), orderBy });
    return this.http.get<CommentPage>(`${this.path(key)}?${params}`).catch(ticketNotFound(key));
  }

  private path(key: string): string {
    return `/rest/api/3/issue/${encodeURIComponent(key)}/comment`;
  }
}
