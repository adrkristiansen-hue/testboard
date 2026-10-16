// Parent/child tree for list and query "tree" mode (pure, unit-tested).
import type { ItemView } from "./types";

export interface TreeRow {
  item: ItemView;
  depth: number;
  hasChildren: boolean;
  /** Shown only to give context to a matching descendant (did not match the filter itself). */
  context: boolean;
}

/**
 * Build a depth-first ordered tree.
 * - `matched` keeps its order at each level (so sorting still applies among siblings).
 * - Ancestors of matches that did not match themselves are added as context rows (like Azure Boards tree queries).
 * - `collapsed` ids hide their descendants.
 */
export function buildTree(matched: ItemView[], all: ItemView[], collapsed: ReadonlySet<number> = new Set()): TreeRow[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  const matchedIds = new Set(matched.map((i) => i.id));
  const included = new Map<number, ItemView>();
  const order: ItemView[] = [];
  const include = (i: ItemView) => {
    if (included.has(i.id)) return;
    included.set(i.id, i);
    order.push(i);
  };
  for (const m of matched) {
    // Walk up to add context ancestors (guard against cycles).
    const chain: ItemView[] = [];
    let cur = m.parentId ? byId.get(m.parentId) : undefined;
    const seen = new Set([m.id]);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    for (const a of chain) include(a);
    include(m);
  }

  const children = new Map<number, ItemView[]>();
  const roots: ItemView[] = [];
  for (const i of order) {
    if (i.parentId && included.has(i.parentId) && i.parentId !== i.id) {
      const list = children.get(i.parentId) ?? [];
      list.push(i);
      children.set(i.parentId, list);
    } else roots.push(i);
  }

  const rows: TreeRow[] = [];
  const visited = new Set<number>();
  const walk = (i: ItemView, depth: number) => {
    if (visited.has(i.id)) return;
    visited.add(i.id);
    const kids = children.get(i.id) ?? [];
    rows.push({ item: i, depth, hasChildren: kids.length > 0, context: !matchedIds.has(i.id) });
    if (collapsed.has(i.id)) return;
    for (const k of kids) walk(k, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return rows;
}
