import { describe, expect, it } from "vitest";
import { buildTree } from "@/lib/tree";
import { item } from "./fixtures";

describe("buildTree", () => {
  const parent = item({ id: 100, title: "Parent" });
  const child = item({ id: 101, parentId: 100, title: "Child" });
  const grandchild = item({ id: 102, parentId: 101, title: "Grandchild" });
  const other = item({ id: 103, title: "Other" });
  const all = [parent, child, grandchild, other];

  it("nests children under parents depth-first", () => {
    const rows = buildTree(all, all);
    expect(rows.map((r) => [r.item.id, r.depth])).toEqual([
      [100, 0],
      [101, 1],
      [102, 2],
      [103, 0],
    ]);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows.every((r) => !r.context)).toBe(true);
  });
  it("adds non-matching ancestors as context rows", () => {
    const rows = buildTree([grandchild], all);
    expect(rows.map((r) => [r.item.id, r.context])).toEqual([
      [100, true],
      [101, true],
      [102, false],
    ]);
  });
  it("hides descendants of collapsed rows", () => {
    expect(buildTree(all, all, new Set([100])).map((r) => r.item.id)).toEqual([100, 103]);
  });
  it("survives parent cycles", () => {
    const a = item({ id: 200, parentId: 201 });
    const b = item({ id: 201, parentId: 200 });
    const rows = buildTree([a, b], [a, b]);
    expect(rows.length).toBeLessThanOrEqual(2);
  });
});
