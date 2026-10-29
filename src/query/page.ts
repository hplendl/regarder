export interface Page<T> {
  items: T[];
  exceeded: boolean;
}

export async function collectPages<T>(options: {
  pageSize: number;
  maxItems: number;
  fetchPage: (offset: number, count: number) => Promise<Page<T>>;
}): Promise<{ items: T[]; truncated: boolean }> {
  if (options.pageSize < 1) throw new Error("pageSize must be at least 1.");
  if (options.maxItems < 1) return { items: [], truncated: true };

  const items: T[] = [];
  let offset = 0;
  while (items.length < options.maxItems) {
    const count = Math.min(options.pageSize, options.maxItems - items.length);
    const page = await options.fetchPage(offset, count);
    items.push(...page.items);
    if (!page.exceeded || page.items.length === 0) {
      return { items, truncated: false };
    }
    offset += page.items.length;
  }
  return { items, truncated: true };
}
