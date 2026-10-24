export interface Page<T> {
  items: T[];
  total?: number | undefined;
  isLast?: boolean | undefined;
}

export interface Collected<T> {
  items: T[];
  total: number | null;
  hasMore: boolean;
}

/**
 * Follow startAt/maxResults pages until `limit` items, the reported total, or the last page.
 * Jira may cap a page below maxResults, so a short page ends the walk only when it gives no other signal.
 */
export async function collectPages<T>(
  fetchPage: (startAt: number, maxResults: number) => Promise<Page<T>>,
  limit: number,
  pageSize: number,
): Promise<Collected<T>> {
  const items: T[] = [];
  let total: number | undefined;
  let ended = false;
  while (!ended && items.length < limit) {
    const want = Math.min(pageSize, limit - items.length);
    const page = await fetchPage(items.length, want);
    items.push(...page.items);
    total = page.total ?? total;
    const short = page.isLast === undefined && page.items.length < want;
    ended =
      page.items.length === 0 ||
      page.isLast === true ||
      (total === undefined ? short : items.length >= total);
  }
  return { items, total: total ?? null, hasMore: total === undefined ? !ended : items.length < total };
}
