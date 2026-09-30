export type CategoryRowLike = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  nameBn: string;
  isVisible: boolean;
};

export type CategoryNode<T extends CategoryRowLike> = T & {
  productCount: number;
  children: (T & { productCount: number })[];
};

export type TreeOptions = {
  /** storefront: drop hidden roots (and their children) and hidden children */
  visibleOnly?: boolean;
  /** products per category id (roots: products whose main category is it; subs: whose sub is it) */
  counts?: Map<string, number>;
};

const byOrder = (a: CategoryRowLike, b: CategoryRowLike) => a.sortOrder - b.sortOrder || a.nameBn.localeCompare(b.nameBn, 'bn');

/**
 * Build the 2-level ক্যাটাগরি → সাব-ক্যাটাগরি tree from flat rows.
 * Children whose parent is missing (deleted/hidden) are dropped, as are
 * grandchildren (the DB forbids them, this keeps the output honest anyway).
 */
export function buildCategoryTree<T extends CategoryRowLike>(rows: T[], opts: TreeOptions = {}): CategoryNode<T>[] {
  const counts = opts.counts ?? new Map<string, number>();
  const keep = (r: T) => !opts.visibleOnly || r.isVisible;
  const roots = rows.filter((r) => r.parentId == null && keep(r)).sort(byOrder);
  const rootIds = new Set(roots.map((r) => r.id));
  const kids = new Map<string, T[]>();
  for (const r of rows) {
    if (r.parentId == null || !rootIds.has(r.parentId) || !keep(r)) continue;
    const list = kids.get(r.parentId) ?? [];
    list.push(r);
    kids.set(r.parentId, list);
  }
  return roots.map((root) => ({
    ...root,
    productCount: counts.get(root.id) ?? 0,
    children: (kids.get(root.id) ?? []).sort(byOrder).map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 })),
  }));
}
