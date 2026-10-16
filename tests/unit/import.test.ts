import { describe, expect, it } from "vitest";
import { guessMapping, validateImport, type ImportTarget } from "@/lib/import";
import { makeResolver, parseDateValue, parseLevel, parseSteps, parseTags } from "@/lib/resolve";
import type { ProjectMeta } from "@/lib/types";
import { defectType, modules, testType } from "./fixtures";

const tt = { ...testType, fields: [{ key: "steps", label: "Test steps", kind: "steps" as const }, { key: "testData", label: "Test data", labelNb: "Testdata", kind: "text" as const }] };
const df = { ...defectType, fields: [{ key: "environment", label: "Environment", labelNb: "Miljø", kind: "select" as const, options: ["TEST", "PROD"] }] };
const meta: Pick<ProjectMeta, "types" | "users" | "modules" | "phases"> = {
  types: [df, tt],
  users: [
    { id: "u1", name: "Maja Sørli", email: "maja@demo.test", color: "", role: "MEMBER" },
    { id: "u2", name: "Lars Myrvold", email: "lars@demo.test", color: "", role: "MEMBER" },
  ],
  modules,
  phases: [{ id: "p2", name: "SIT 2", startDate: null, endDate: null, order: 0 }],
};
const defaults = { typeId: tt.id, phaseId: null, moduleId: null };

describe("guessMapping", () => {
  it("recognises English and Norwegian headers and custom fields, using each target once", () => {
    expect(guessMapping(["Tittel", "Status", "Tildelt", "Modul", "Fase", "Frist", "Teststeg", "Testdata", "Miljø", "Notes", "Navn"], meta)).toEqual([
      "title", "state", "assignedTo", "module", "phase", "dueDate", "steps", "fields.testData", "fields.environment", "ignore", "ignore",
    ]);
  });
});

describe("resolver", () => {
  const r = makeResolver(meta);
  it("finds users by e-mail or unique name", () => {
    expect(r.user("MAJA@demo.test")).toEqual({ ok: true, value: "u1" });
    expect(r.user("Lars  Myrvold")).toEqual({ ok: true, value: "u2" });
    expect(r.user("")).toEqual({ ok: true, value: null });
    expect(r.user("Nobody").ok).toBe(false);
  });
  it("finds modules by path (any separator) or unique name", () => {
    expect(r.module("Employee Central/Hire")).toEqual({ ok: true, value: "hire" });
    expect(r.module("employee central > termination")).toEqual({ ok: true, value: "term" });
    expect(r.module("Recruiting")).toEqual({ ok: true, value: "rec" });
  });
  it("finds types by key, name or Norwegian alias", () => {
    expect(r.type("defect").ok && r.type("defect")).toMatchObject({ value: { id: df.id } });
    expect(r.type("Feil")).toMatchObject({ ok: true, value: { id: df.id } });
    expect(r.type("TEST_TASK")).toMatchObject({ ok: true, value: { id: tt.id } });
  });
});

describe("value parsers", () => {
  it("parses dates in ISO, Norwegian and Excel serial form", () => {
    expect(parseDateValue("2026-10-31")).toEqual({ ok: true, value: "2026-10-31" });
    expect(parseDateValue("31.10.2026")).toEqual({ ok: true, value: "2026-10-31" });
    expect(parseDateValue(46326)).toEqual({ ok: true, value: "2026-10-31" });
    expect(parseDateValue("31.02.2026").ok).toBe(false);
  });
  it("parses priority words and numbers", () => {
    expect(parseLevel("1 - Critical", "P")).toEqual({ ok: true, value: 1 });
    expect(parseLevel("Høy", "P")).toEqual({ ok: true, value: 2 });
    expect(parseLevel("7", "P").ok).toBe(false);
  });
  it("splits tags and steps", () => {
    expect(parseTags("a; b,c ,")).toEqual(["a", "b", "c"]);
    expect(parseSteps("1. Open form | Form opens\n2) Save => Saved\n\nCheck log")).toEqual([
      { action: "Open form", expected: "Form opens" },
      { action: "Save", expected: "Saved" },
      { action: "Check log", expected: "" },
    ]);
  });
});

describe("validateImport", () => {
  const mapping: ImportTarget[] = ["title", "type", "state", "assignedTo", "module", "phase", "steps", "fields.environment", "parentId"];
  it("resolves a valid row", () => {
    const [r] = validateImport([["Hire temp", "", "In test", "maja@demo.test", "Hire", "SIT 2", "Open | Opens", "", ""]], mapping, meta, defaults);
    expect(r.errors).toEqual([]);
    expect(r.item).toMatchObject({ typeId: tt.id, title: "Hire temp", state: "In test", assignedToId: "u1", moduleId: "hire", phaseId: "p2", fields: { steps: [{ action: "Open", expected: "Opens" }] } });
  });
  it("collects all errors for a row and keeps file line numbers", () => {
    const res = validateImport(
      [
        ["", "", "", "", "", "", "", "", ""],
        ["", "Defect", "Nope", "ghost@x", "Nowhere", "UAT 9", "Step", "STAGE", "999"],
      ],
      mapping,
      meta,
      defaults,
      new Set([1]),
    );
    expect(res).toHaveLength(1);
    expect(res[0].line).toBe(3);
    expect(res[0].item).toBeNull();
    expect(res[0].errors).toEqual([
      "Title is missing",
      '"Nope" is not a state of Defect',
      'Unknown user "ghost@x"',
      'Unknown module "Nowhere"',
      'Unknown phase "UAT 9"',
      "Parent #999 does not exist in this project",
      "Defect has no test steps field",
      'Environment: "STAGE" is not one of TEST, PROD',
    ]);
  });
  it("ignores custom fields that belong to another type", () => {
    const [r] = validateImport([["Q", "Test task", "", "", "", "", "", "PROD", ""]], mapping, meta, defaults);
    expect(r.errors).toEqual([]);
    expect(r.item!.fields).toEqual({});
  });
});
