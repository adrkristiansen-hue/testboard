import { describe, expect, it } from "vitest";
import {
  columnForItem,
  columnsAcceptingType,
  needsRebalance,
  orderBetween,
  parseStateMap,
  placeItems,
  resolveMove,
  validateColumns,
  wipStatus,
  type ColumnDef,
} from "@/lib/board";
import { defectType, item, testType } from "./fixtures";

const columns: ColumnDef[] = [
  { id: "c1", name: "To do", order: 0, wipLimit: null, split: false, stateMap: { [defectType.id]: ["New"], [testType.id]: ["Not started"] } },
  { id: "c2", name: "In progress", order: 1, wipLimit: 2, split: true, stateMap: { [defectType.id]: ["Active"], [testType.id]: ["In test"] } },
  { id: "c3", name: "Failed / Blocked", order: 2, wipLimit: 3, split: false, stateMap: { [testType.id]: ["Failed", "Blocked"] } },
  { id: "c4", name: "Retest", order: 3, wipLimit: null, split: false, stateMap: { [defectType.id]: ["Fixed", "Ready for retest"] } },
  { id: "c5", name: "Done", order: 4, wipLimit: null, split: false, stateMap: { [defectType.id]: ["Closed", "Rejected"], [testType.id]: ["Passed"] } },
];

describe("column mapping", () => {
  it("finds the column for a type + state", () => {
    expect(columnForItem({ typeId: defectType.id, state: "Active" }, columns)?.id).toBe("c2");
    expect(columnForItem({ typeId: testType.id, state: "Blocked" }, columns)?.id).toBe("c3");
    expect(columnForItem({ typeId: defectType.id, state: "Ready for retest" }, columns)?.id).toBe("c4");
    expect(columnForItem({ typeId: defectType.id, state: "Unknown" }, columns)).toBeUndefined();
  });

  it("uses column order, not array order", () => {
    const shuffled = [columns[4], columns[0], columns[2], columns[1], columns[3]];
    expect(columnForItem({ typeId: testType.id, state: "Passed" }, shuffled)?.id).toBe("c5");
  });

  it("lists columns accepting a type", () => {
    expect(columnsAcceptingType(defectType.id, columns).map((c) => c.id)).toEqual(["c1", "c2", "c4", "c5"]);
  });

  it("parses legacy single-state maps", () => {
    expect(parseStateMap('{"a":"New","b":["X","Y"]}')).toEqual({ a: ["New"], b: ["X", "Y"] });
    expect(parseStateMap("garbage")).toEqual({});
  });

  it("validates that each state has exactly one column", () => {
    expect(validateColumns(columns, [defectType, testType])).toEqual([]);
    const broken = columns.slice(0, 2);
    const problems = validateColumns(broken, [defectType]);
    expect(problems.some((p) => p.includes('"Closed"'))).toBe(true);
    // Removed-category states may be left off the board
    expect(problems.some((p) => p.includes('"Rejected"'))).toBe(false);
    const dup = [...columns, { ...columns[0], id: "c6", name: "Dup" }];
    expect(validateColumns(dup, [defectType]).some((p) => p.includes("several columns"))).toBe(true);
  });
});

describe("moving cards", () => {
  it("changes state to the first allowed mapped state", () => {
    const r = resolveMove(item({ state: "Active" }), columns[3], defectType);
    expect(r).toEqual({ ok: true, state: "Fixed", columnDone: false, stateChanged: true });
  });

  it("refuses columns without a mapping for the type", () => {
    expect(resolveMove(item({ state: "New" }), columns[2], defectType)).toEqual({ ok: false, reason: "NO_MAPPING" });
  });

  it("refuses transitions the workflow does not allow", () => {
    // New -> Fixed/Ready for retest is not allowed for defects
    expect(resolveMove(item({ state: "New" }), columns[3], defectType)).toEqual({ ok: false, reason: "NOT_ALLOWED" });
  });

  it("keeps the state when moving within the same column and toggles Doing/Done", () => {
    const r = resolveMove(item({ state: "Active" }), columns[1], defectType, true);
    expect(r).toEqual({ ok: true, state: "Active", columnDone: true, stateChanged: false });
  });

  it("ignores Done for non-split columns", () => {
    const r = resolveMove(item({ state: "Fixed" }), columns[4], defectType, true);
    expect(r.ok && r.columnDone).toBe(false);
  });
});

describe("WIP limits", () => {
  it("classifies counts against limits", () => {
    expect(wipStatus(5, null)).toBe("none");
    expect(wipStatus(5, 0)).toBe("none");
    expect(wipStatus(1, 2)).toBe("ok");
    expect(wipStatus(2, 2)).toBe("at");
    expect(wipStatus(3, 2)).toBe("over");
  });

  it("places items into doing/done halves and reports unmapped items", () => {
    const items = [
      item({ state: "Active", columnDone: false, boardOrder: 2 }),
      item({ state: "Active", columnDone: true }),
      item({ state: "Active", columnDone: false, boardOrder: 1 }),
      item({ state: "Weird" }),
    ];
    const { byColumn, unmapped } = placeItems(items, columns);
    const c2 = byColumn.get("c2")!;
    expect(c2.doing.map((i) => i.boardOrder)).toEqual([1, 2]);
    expect(c2.done).toHaveLength(1);
    expect(unmapped).toHaveLength(1);
    expect(wipStatus(c2.doing.length + c2.done.length, columns[1].wipLimit)).toBe("over");
  });
});

describe("ordering", () => {
  it("computes fractional ranks", () => {
    expect(orderBetween(undefined, undefined)).toBe(0);
    expect(orderBetween(10, undefined)).toBe(1034);
    expect(orderBetween(undefined, 10)).toBe(-1014);
    expect(orderBetween(10, 20)).toBe(15);
  });

  it("detects when a rebalance is needed", () => {
    expect(needsRebalance(1, 1 + 1e-9)).toBe(true);
    expect(needsRebalance(1, 2)).toBe(false);
  });
});
