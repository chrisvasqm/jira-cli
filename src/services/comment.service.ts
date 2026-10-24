import type { AdfNode } from "../core/adf.js";
import { notFoundAs, ticketNotFound } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages } from "../core/paging.js";
import { issuePath, type Comment } from "../core/jira-types.js";

interface CommentPage {
  comments: Comment[];
  total: number;
}

/** A 404 on /comment/{id} can mean the ticket or the comment is missing. */
function commentNotFound(key: string, id: string): (err: unknown) => never {
  return notFoundAs("COMMENT_NOT_FOUND", `Comment #${id} on ${key} does not exist, or the ticket does not.`);
}

/** Jira returns at most 100 comments per page. */
const PAGE_SIZE = 100;

/** `latest` reads one page, so this is the most it returns. */
export const MAX_LATEST = PAGE_SIZE;

/** /rest/api/3/issue/{key}/comment endpoints. */
export class CommentService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Newest `limit` (>= 1) comments, returned oldest first so they read like a conversation. */
  async latest(key: string, limit: number): Promise<CommentPage> {
    const page = await this.page(key, 0, Math.min(limit, MAX_LATEST), "-created");
    return { comments: page.comments.toReversed(), total: page.total };
  }

  /** Oldest first, up to `limit` comments, following pages as needed. */
  async list(key: string, limit: number): Promise<CommentPage> {
    const result = await collectPages<Comment>(
      async (startAt, maxResults) => {
        const page = await this.page(key, startAt, maxResults, "created");
        return { items: page.comments, total: page.total };
      },
      limit,
      PAGE_SIZE,
    );
    return { comments: result.items, total: result.total ?? result.items.length };
  }

  add(key: string, body: AdfNode): Promise<Comment> {
    return this.http.post<Comment>(this.path(key), { body }).catch(ticketNotFound(key));
  }

  update(key: string, id: string, body: AdfNode): Promise<Comment> {
    return this.http.put<Comment>(`${this.path(key)}/${id}`, { body }).catch(commentNotFound(key, id));
  }

  async remove(key: string, id: string): Promise<void> {
    await this.http.delete<undefined>(`${this.path(key)}/${id}`).catch(commentNotFound(key, id));
  }

  private page(key: string, startAt: number, maxResults: number, orderBy: string): Promise<CommentPage> {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(maxResults), orderBy });
    return this.http.get<CommentPage>(`${this.path(key)}?${params}`).catch(ticketNotFound(key));
  }

  private path(key: string): string {
    return `${issuePath(key)}/comment`;
  }
}
