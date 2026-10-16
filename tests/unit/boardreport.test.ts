import { describe, expect, it } from "vitest";
import { boardColumnColors, computeBoardReport, type StateEvent } from "@/lib/dashboard";
import type { ColumnDef } from "@/lib/board";
import { defectType, item, testType } from "./fixtures";

const columns: ColumnDef[] = [
  { id: "c1", name: "To do", order: 0, wipLimit: null, split: false, stateMap: { [defectType.id]: ["New"] } },
  { id: "c2", name: "In progress", order: 1, wipLimit: 1, split: true, stateMap: { [defectType.id]: ["Active"] } },
  { id: "c3", name: "Done", order: 2, wipLimit: null, split: false, stateMap: { [defectType.id]: ["Closed"] } },
];
const opts = { now: new Date("2026-10-06T12:00:00"), flowDays: 3, flowType: "" };

describe("computeBoardReport", () => {
  const items = [
    item({ id: 1, state: "Active", createdAt: "2026-10-01T08:00:00.000Z" }),
    item({ id: 2, state: "Active", columnDone: true, createdAt: "2026-10-01T08:00:00.000Z" }),
    item({ id: 3, state: "Closed", createdAt: "2026-10-01T08:00:00.000Z" }),
    item({ id: 4, typeId: testType.id, state: "Passed" }), // no column maps test tasks
  ];
  const events: StateEvent[] = [{ itemId: 3, field: "state", from: "Active", to: "Closed", at: "2026-10-05T10:00:00.000Z" }];
  const r = computeBoardReport(items, events, columns, opts, [defectType, testType]);

  it("counts items per column with doing/done and WIP status", () => {
    expect(r.columns.map((c) => [c.name, c.count, c.doing, c.done, c.overLimit])).toEqual([
      ["To do", 0, 0, 0, false],
      ["In progress", 2, 1, 1, true],
      ["Done", 1, 1, 0, false],
    ]);
    expect(r.unmapped).toBe(1);
  });
  it("replays history into columns per day", () => {
    expect(r.flow.map((row) => [row.date, row.c2, row.c3])).toEqual([
      ["2026-10-04", 3, 0],
      ["2026-10-05", 2, 1],
      ["2026-10-06", 2, 1],
    ]);
  });
});

describe("boardColumnColors", () => {
  it("uses a light-to-dark ramp up to 5 columns, then fixed categorical slots, then grey", () => {
    expect(boardColumnColors(2)).toEqual(["#86b6ef", "#0d366b"]);
    expect(new Set(boardColumnColors(5)).size).toBe(5);
    expect(boardColumnColors(6)[0]).toBe("#2a78d6");
    expect(boardColumnColors(9)[8]).toBe("#c3c2b7");
  });
});
