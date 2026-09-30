import { buildCategoryTree } from './category-tree';

const row = (id: string, parentId: string | null, sortOrder: number, isVisible = true, nameBn = id) => ({ id, parentId, sortOrder, isVisible, nameBn });

describe('buildCategoryTree', () => {
  const rows = [
    row('oil', null, 1),
    row('honey', null, 0),
    row('mustard', 'oil', 1),
    row('ghee', 'oil', 0),
    row('sundarban', 'honey', 0, false),
    row('dates', null, 2, false),
    row('ajwa', 'dates', 0),
    row('orphan', 'missing', 0),
  ];

  it('nests children under roots, both sorted by sortOrder', () => {
    const t = buildCategoryTree(rows);
    expect(t.map((n) => n.id)).toEqual(['honey', 'oil', 'dates']);
    expect(t[1].children.map((c) => c.id)).toEqual(['ghee', 'mustard']);
  });

  it('drops orphans (parent missing)', () => {
    const ids = buildCategoryTree(rows).flatMap((n) => [n.id, ...n.children.map((c) => c.id)]);
    expect(ids).not.toContain('orphan');
  });

  it('visibleOnly hides hidden roots with their subtree and hidden subs individually', () => {
    const t = buildCategoryTree(rows, { visibleOnly: true });
    expect(t.map((n) => n.id)).toEqual(['honey', 'oil']);
    expect(t[0].children).toEqual([]);
  });

  it('attaches product counts (0 by default)', () => {
    const t = buildCategoryTree(rows, { counts: new Map([['oil', 7], ['ghee', 3]]) });
    const oil = t.find((n) => n.id === 'oil')!;
    expect(oil.productCount).toBe(7);
    expect(oil.children.find((c) => c.id === 'ghee')!.productCount).toBe(3);
    expect(t.find((n) => n.id === 'honey')!.productCount).toBe(0);
  });

  it('ties on sortOrder fall back to the Bangla name', () => {
    const t = buildCategoryTree([row('b', null, 0, true, 'খ'), row('a', null, 0, true, 'ক')]);
    expect(t.map((n) => n.id)).toEqual(['a', 'b']);
  });
});
