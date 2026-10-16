import { describe, expect, it } from "vitest";
import { buildLanes, DEFAULT_LANE_KEY, groupByLane, laneKeyForItem, visibleLanes, type LaneContext, type SwimlaneConfig } from "@/lib/swimlanes";
import { ctx, item, modules } from "./fixtures";
import type { UserLite } from "@/lib/types";

const users: UserLite[] = [
  { id: "u1", name: "Kari Testersen", email: "kari@example.test", color: "#000", role: "MEMBER" },
  { id: "u2", name: "Ola Lead", email: "ola@example.test", color: "#000", role: "TEST_LEAD" },
];
const laneCtx: LaneContext = { modules, users, query: ctx() };

describe("swimlanes", () => {
  it("puts everything in the default lane when mode is none", () => {
    expect(laneKeyForItem(item(), { mode: "none" }, laneCtx)).toBe(DEFAULT_LANE_KEY);
    expect(buildLanes({ mode: "none" }, laneCtx)).toHaveLength(1);
  });

  it("groups by top-level module", () => {
    const cfg: SwimlaneConfig = { mode: "module" };
    expect(laneKeyForItem(item({ moduleId: "hire" }), cfg, laneCtx)).toBe("ec");
    expect(laneKeyForItem(item({ moduleId: "rec" }), cfg, laneCtx)).toBe("rec");
    expect(laneKeyForItem(item({ moduleId: null }), cfg, laneCtx)).toBe(DEFAULT_LANE_KEY);
    const lanes = buildLanes(cfg, laneCtx);
    expect(lanes.map((l) => l.key)).toEqual(["ec", "rec", DEFAULT_LANE_KEY]);
    expect(lanes[0].assign).toEqual({ field: "moduleId", value: "ec" });
  });

  it("groups by assignee with an unassigned lane", () => {
    const cfg: SwimlaneConfig = { mode: "assignee" };
    expect(laneKeyForItem(item({ assignedToId: "u2" }), cfg, laneCtx)).toBe("u2");
    expect(laneKeyForItem(item(), cfg, laneCtx)).toBe(DEFAULT_LANE_KEY);
    const lanes = buildLanes(cfg, laneCtx);
    expect(lanes.at(-1)?.assign).toEqual({ field: "assignedToId", value: null });
  });

  it("hides empty assignee lanes for non-members", () => {
    const cfg: SwimlaneConfig = { mode: "assignee" };
    const items = [item({ assignedToId: "u1" })];
    const grouped = groupByLane(items, cfg, laneCtx);
    const lanes = visibleLanes(buildLanes(cfg, laneCtx), grouped, cfg, new Set());
    expect(lanes.map((l) => l.key)).toEqual(["u1", DEFAULT_LANE_KEY]);
  });

  it("groups by priority", () => {
    const cfg: SwimlaneConfig = { mode: "priority" };
    expect(laneKeyForItem(item({ priority: 1 }), cfg, laneCtx)).toBe("p1");
    expect(buildLanes(cfg, laneCtx).map((l) => l.key)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("applies custom rules in order (first match wins)", () => {
    const cfg: SwimlaneConfig = {
      mode: "rules",
      defaultLaneName: "Standard",
      rules: [
        { id: "expedite", name: "Expedite", when: { logic: "and", clauses: [{ field: "priority", op: "eq", value: 1 }] } },
        { id: "sev", name: "Critical defects", when: { logic: "and", clauses: [{ field: "severity", op: "lte", value: 2 }] } },
        { id: "empty", name: "Never", when: { logic: "and", clauses: [] } },
      ],
    };
    expect(laneKeyForItem(item({ priority: 1, severity: 1 }), cfg, laneCtx)).toBe("expedite");
    expect(laneKeyForItem(item({ priority: 3, severity: 2 }), cfg, laneCtx)).toBe("sev");
    expect(laneKeyForItem(item({ priority: 3 }), cfg, laneCtx)).toBe(DEFAULT_LANE_KEY);
    const lanes = buildLanes(cfg, laneCtx);
    expect(lanes.map((l) => l.name)).toEqual(["Expedite", "Critical defects", "Never", "Standard"]);
  });
});
