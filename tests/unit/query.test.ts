import { describe, expect, it } from "vitest";
import { evaluateClause, isOverdue, resolveMacro, runQuery, type QueryDefinition } from "@/lib/query";
import { EMPTY_FILTER, filterFromParams, filterToParams, filterToQuery, UNASSIGNED } from "@/lib/filters";
import { cardStyle, DEFAULT_CARD_CONFIG } from "@/lib/cards";
import { ctx, defectType, item, testType } from "./fixtures";

describe("query evaluation", () => {
  const c = ctx();

  it("evaluates simple comparisons", () => {
    const i = item({ priority: 1, title: "Hire flow breaks" });
    expect(evaluateClause(i, { field: "priority", op: "eq", value: 1 }, c)).toBe(true);
    expect(evaluateClause(i, { field: "priority", op: "lt", value: 2 }, c)).toBe(true);
    expect(evaluateClause(i, { field: "title", op: "contains", value: "HIRE" }, c)).toBe(true);
    expect(evaluateClause(i, { field: "title", op: "notContains", value: "hire" }, c)).toBe(false);
  });

  it("supports type keys, state categories and custom fields", () => {
    const i = item({ typeId: testType.id, state: "Passed", fields: { outcome: "Passed" } });
    expect(evaluateClause(i, { field: "type", op: "eq", value: "TEST_TASK" }, c)).toBe(true);
    expect(evaluateClause(i, { field: "category", op: "eq", value: "COMPLETED" }, c)).toBe(true);
    expect(evaluateClause(i, { field: "fields.outcome", op: "in", value: ["Passed", "Failed"] }, c)).toBe(true);
  });

  it("matches module subtrees with 'under'", () => {
    expect(evaluateClause(item({ moduleId: "hire" }), { field: "module", op: "under", value: "ec" }, c)).toBe(true);
    expect(evaluateClause(item({ moduleId: "rec" }), { field: "module", op: "under", value: "ec" }, c)).toBe(false);
  });

  it("handles tags (array) with in/eq/neq", () => {
    const i = item({ tags: ["Payroll", "regression"] });
    expect(evaluateClause(i, { field: "tags", op: "in", value: ["payroll"] }, c)).toBe(true);
    expect(evaluateClause(i, { field: "tags", op: "eq", value: "regression" }, c)).toBe(true);
    expect(evaluateClause(i, { field: "tags", op: "neq", value: "smoke" }, c)).toBe(true);
    expect(evaluateClause(item(), { field: "tags", op: "isEmpty" }, c)).toBe(true);
  });

  it("supports link and comment counts", () => {
    const i = item({ commentCount: 3, linkCount: 1 });
    expect(evaluateClause(i, { field: "commentCount", op: "gte", value: 3 }, c)).toBe(true);
    expect(evaluateClause(i, { field: "linkCount", op: "gt", value: 1 }, c)).toBe(false);
  });

  it("resolves @me and @today macros", () => {
    expect(resolveMacro("@me", c)).toBe("u1");
    const d = new Date(String(resolveMacro("@today-7", c)));
    expect(d.getDate()).toBe(8);
    expect(evaluateClause(item({ assignedToId: "u1" }), { field: "assignedTo", op: "eq", value: "@me" }, c)).toBe(true);
    expect(evaluateClause(item({ createdAt: "2026-10-10T08:00:00" }), { field: "createdAt", op: "gte", value: "@today-7" }, c)).toBe(true);
  });

  it("combines nested and/or groups", () => {
    const def: QueryDefinition = {
      root: {
        logic: "and",
        clauses: [
          { field: "type", op: "eq", value: "DEFECT" },
          {
            logic: "or",
            clauses: [
              { field: "severity", op: "eq", value: 1 },
              { field: "priority", op: "eq", value: 1 },
            ],
          },
        ],
      },
      sort: [{ field: "id", dir: "desc" }],
    };
    const items = [item({ severity: 1 }), item({ priority: 1 }), item({ priority: 3 }), item({ typeId: testType.id, priority: 1 })];
    const res = runQuery(items, def, c);
    expect(res.map((r) => r.id)).toEqual([items[1].id, items[0].id]);
  });

  it("detects overdue items, ignoring resolved/closed ones", () => {
    expect(isOverdue(item({ dueDate: "2026-10-01" }), c)).toBe(true);
    expect(isOverdue(item({ dueDate: "2026-10-20" }), c)).toBe(false);
    expect(isOverdue(item({ dueDate: "2026-10-01", state: "Closed" }), c)).toBe(false);
    expect(isOverdue(item({ dueDate: "2026-10-01", state: "Fixed", typeId: defectType.id }), c)).toBe(false);
  });
});

describe("filter bar", () => {
  const c = ctx();

  it("returns everything for an empty filter", () => {
    expect(filterToQuery(EMPTY_FILTER).root.clauses).toHaveLength(0);
  });

  it("filters by keyword words, id and unassigned", () => {
    const items = [item({ title: "Rehire with gap" }), item({ title: "Termination letter", assignedToId: "u2" })];
    const kw = runQuery(items, filterToQuery({ ...EMPTY_FILTER, keyword: "rehire gap" }), c);
    expect(kw.map((i) => i.id)).toEqual([items[0].id]);
    const byId = runQuery(items, filterToQuery({ ...EMPTY_FILTER, keyword: `#${items[1].id}` }), c);
    expect(byId.map((i) => i.id)).toEqual([items[1].id]);
    const unassigned = runQuery(items, filterToQuery({ ...EMPTY_FILTER, assignees: [UNASSIGNED] }), c);
    expect(unassigned.map((i) => i.id)).toEqual([items[0].id]);
  });

  it("round-trips through URL params", () => {
    const f = { ...EMPTY_FILTER, keyword: "hire", types: ["DEFECT"], priorities: [1, 2], modules: ["ec"] };
    expect(filterFromParams(filterToParams(f))).toEqual(f);
  });
});

describe("card colour rules", () => {
  it("applies severity, overdue and blocked rules", () => {
    const c = ctx();
    const s = cardStyle(item({ severity: 1, dueDate: "2026-09-01" }), DEFAULT_CARD_CONFIG.rules, c);
    expect(s.borderColor).toBe("#dc2626");
    expect(s.background).toBe("#fee2e2");
    const blocked = cardStyle(item({ typeId: testType.id, state: "Blocked" }), DEFAULT_CARD_CONFIG.rules, c);
    expect(blocked.borderColor).toBe("#f59e0b");
    expect(cardStyle(item(), DEFAULT_CARD_CONFIG.rules, c).matched).toEqual([]);
  });
});
