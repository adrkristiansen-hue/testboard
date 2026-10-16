import { describe, expect, it } from "vitest";
import { columnCatalogue, columnNames, csvSafe, DEFAULT_COLUMNS, exportFileName, exportRows, resolveColumns } from "@/lib/columns";
import type { ProjectMeta } from "@/lib/types";
import { defectType, item, modules, testType } from "./fixtures";

const meta: Pick<ProjectMeta, "types" | "users" | "modules" | "phases"> = {
  types: [{ ...defectType, fields: [{ key: "environment", label: "Environment", kind: "select", options: ["TEST"] }, { key: "actual", label: "Actual", kind: "richtext" }] }, testType],
  users: [{ id: "u1", name: "Maja Sørli", email: "m@x", color: "#000", role: "MEMBER" }],
  modules,
  phases: [{ id: "p1", name: "SIT 2", startDate: null, endDate: null, order: 0 }],
};

describe("column catalogue", () => {
  it("includes scalar custom fields but not rich text", () => {
    const keys = columnCatalogue(meta).map((c) => c.key);
    expect(keys).toContain("fields.environment");
    expect(keys).not.toContain("fields.actual");
  });
  it("resolves keys in the given order and falls back to defaults", () => {
    const cat = columnCatalogue(meta);
    expect(resolveColumns(["title", "id", "nope"], cat).map((c) => c.key)).toEqual(["title", "id"]);
    expect(resolveColumns([], cat).map((c) => c.key)).toEqual(DEFAULT_COLUMNS);
  });
});

describe("export", () => {
  it("formats names, dates and custom fields", () => {
    const cat = columnCatalogue(meta);
    const cols = resolveColumns(["id", "type", "assignedTo", "module", "phase", "dueDate", "tags", "fields.environment", "category"], cat);
    const [row] = exportRows([item({ id: 9, assignedToId: "u1", moduleId: "hire", phaseId: "p1", dueDate: "2026-10-20T00:00:00.000Z", tags: ["a", "b"], fields: { environment: "TEST" } })], cols, columnNames(meta));
    expect(row).toEqual([9, "Defect", "Maja Sørli", "Employee Central > Hire", "SIT 2", "2026-10-20", "a, b", "TEST", "PROPOSED"]);
  });
  it("neutralises CSV formula injection but keeps numbers", () => {
    expect(csvSafe("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(csvSafe("+1")).toBe("'+1");
    expect(csvSafe("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvSafe("Normal title")).toBe("Normal title");
    expect(csvSafe(-3)).toBe(-3);
    expect(csvSafe(null)).toBe("");
  });
  it("builds safe file names", () => {
    expect(exportFileName("HRS / Åpne feil: kritisk", "xlsx", new Date("2026-10-16T12:00:00Z"))).toBe("HRS-Åpne-feil-kritisk-2026-10-16.xlsx");
    expect(exportFileName("../..", "csv", new Date("2026-10-16T12:00:00Z"))).toBe("work-items-2026-10-16.csv");
  });
});
