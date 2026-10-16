import { describe, expect, it } from "vitest";
import { computeDashboard, stateAt, type StateEvent } from "@/lib/dashboard";
import type { ProjectMeta } from "@/lib/types";
import { defectType, item, modules, testType } from "./fixtures";

const meta: Pick<ProjectMeta, "types" | "modules" | "phases" | "users"> = {
  types: [defectType, testType],
  modules,
  phases: [{ id: "p1", name: "SIT 2", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-10T00:00:00.000Z", order: 0 }],
  users: [
    { id: "u1", name: "Maja", email: "", color: "", role: "MEMBER" },
    { id: "u2", name: "Nora", email: "", color: "", role: "MEMBER" },
  ],
};
const opts = { now: new Date("2026-10-06T12:00:00"), phaseId: "", flowType: "", flowDays: 7, unassignedLabel: "Unassigned", noModuleLabel: "No module" };

describe("stateAt", () => {
  const it1 = { id: 1, state: "Closed", createdAt: "2026-10-01T08:00:00.000Z" };
  const ev: StateEvent[] = [
    { itemId: 1, field: "__created", from: null, to: "New", at: "2026-10-01T08:00:00.000Z" },
    { itemId: 1, field: "state", from: "New", to: "Active", at: "2026-10-03T08:00:00.000Z" },
    { itemId: 1, field: "state", from: "Active", to: "Closed", at: "2026-10-05T08:00:00.000Z" },
  ];
  it("replays transitions up to a point in time", () => {
    expect(stateAt(it1, ev, new Date("2026-09-30T00:00:00Z").getTime())).toBeNull();
    expect(stateAt(it1, ev, new Date("2026-10-02T00:00:00Z").getTime())).toBe("New");
    expect(stateAt(it1, ev, new Date("2026-10-04T00:00:00Z").getTime())).toBe("Active");
    expect(stateAt(it1, ev, new Date("2026-10-06T00:00:00Z").getTime())).toBe("Closed");
  });
  it("infers the initial state from the first transition when creation was not logged", () => {
    expect(stateAt(it1, ev.slice(1), new Date("2026-10-02T00:00:00Z").getTime())).toBe("New");
  });
});

describe("computeDashboard", () => {
  const items = [
    item({ id: 1, typeId: defectType.id, state: "Active", severity: 1, assignedToId: "u1", moduleId: "hire", createdAt: "2026-10-05T08:00:00.000Z" }),
    item({ id: 2, typeId: defectType.id, state: "Closed", severity: 2, moduleId: "rec" }),
    item({ id: 3, typeId: defectType.id, state: "New", severity: 3, createdAt: "2026-09-01T08:00:00.000Z", dueDate: "2026-10-01T00:00:00.000Z" }),
    item({ id: 4, typeId: testType.id, state: "Passed", fields: { outcome: "Passed" }, moduleId: "term", phaseId: "p1" }),
    item({ id: 5, typeId: testType.id, state: "Failed", fields: { outcome: "Failed" }, moduleId: "hire", phaseId: "p1" }),
    item({ id: 6, typeId: testType.id, state: "Not started", moduleId: "hire", phaseId: "p1" }),
  ];
  const d = computeDashboard(items, [], meta, opts);

  it("computes KPIs", () => {
    expect(d.kpis).toEqual({ openDefects: 2, criticalDefects: 1, overdue: 1, testsTotal: 3, testsExecuted: 2, passRate: 50 });
  });
  it("rolls modules up to top level", () => {
    const ec = d.outcomesByModule.find((r) => r.module === "Employee Central")!;
    expect(ec).toMatchObject({ Passed: 1, Failed: 1, "Not run": 1, Blocked: 0 });
    expect(d.stateByModule.find((r) => r.module === "No module")).toMatchObject({ PROPOSED: 1 });
  });
  it("lists every user in defects by assignee, including zero and unassigned", () => {
    expect(d.defectsByAssignee).toEqual([
      { userId: "u1", name: "Maja", count: 1 },
      { userId: null, name: "Unassigned", count: 1 },
      { userId: "u2", name: "Nora", count: 0 },
    ]);
  });
  it("buckets open defects by age", () => {
    expect(d.defectAgeing.find((b) => b.bucket === "0-3")!.count).toBe(1);
    expect(d.defectAgeing.find((b) => b.bucket === "30+")!.count).toBe(1);
  });
  it("builds one flow row per day", () => {
    expect(d.flow).toHaveLength(7);
    expect(d.flow.at(-1)!.date).toBe("2026-10-06");
  });
  it("draws a burn-down only for a phase with dates, with no actuals in the future", () => {
    expect(d.burndown).toBeNull();
    const b = computeDashboard(items, [], meta, { ...opts, phaseId: "p1" }).burndown!;
    expect(b.points).toHaveLength(10);
    expect(b.points[0].ideal).toBe(3);
    expect(b.points.at(-1)!.ideal).toBe(0);
    expect(b.points.find((p) => p.date === "2026-10-06")!.remaining).toBe(2);
    expect(b.points.find((p) => p.date === "2026-10-08")!.remaining).toBeNull();
  });
});
