import { describe, expect, it } from "vitest";
import { applyTitlePattern, bulkRowKey, expandBulkCreate } from "@/lib/bulkcreate";

const names = {
  module: (id: string) => ({ hire: "Hire", term: "Termination" })[id] ?? id,
  phase: (id: string) => ({ sit1: "SIT 1", sit2: "SIT 2" })[id] ?? id,
};

describe("applyTitlePattern", () => {
  it("fills placeholders", () => {
    expect(applyTitlePattern("{module} – {title} ({phase})", { title: "Happy path", module: "Hire", phase: "SIT 2" })).toBe("Hire – Happy path (SIT 2)");
  });
  it("tidies separators and brackets left by empty placeholders", () => {
    expect(applyTitlePattern("{module} – {title}", { title: "Happy path", module: "", phase: "" })).toBe("Happy path");
    expect(applyTitlePattern("{title} – {module} – {phase}", { title: "Happy path", module: "", phase: "SIT 2" })).toBe("Happy path – SIT 2");
    expect(applyTitlePattern("{title} ({phase})", { title: "Happy path", module: "Hire", phase: "" })).toBe("Happy path");
    expect(applyTitlePattern("[{phase}] {title}", { title: "Happy path", module: "", phase: "" })).toBe("Happy path");
    expect(applyTitlePattern("{title}: {module}", { title: "Happy path", module: "", phase: "" })).toBe("Happy path");
  });
  it("keeps hyphens inside words", () => {
    expect(applyTitlePattern("{title}", { title: "Re-hire with end-date", module: "", phase: "" })).toBe("Re-hire with end-date");
  });
});

describe("expandBulkCreate", () => {
  it("creates title × module × phase combinations", () => {
    const rows = expandBulkCreate({ titles: ["A", "B"], moduleIds: ["hire", "term"], phaseIds: ["sit1", "sit2"], pattern: "{module}: {title}" }, names);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ title: "Hire: A", moduleId: "hire", phaseId: "sit1" });
    expect(rows.at(-1)).toEqual({ title: "Termination: B", moduleId: "term", phaseId: "sit2" });
  });
  it("treats empty module/phase lists as a single null value", () => {
    expect(expandBulkCreate({ titles: ["A"], moduleIds: [], phaseIds: [] }, names)).toEqual([{ title: "A", moduleId: null, phaseId: null }]);
  });
  it("ignores blank and duplicate titles", () => {
    expect(expandBulkCreate({ titles: ["  A ", "", "A", "  "], moduleIds: ["hire"], phaseIds: [] }, names)).toHaveLength(1);
  });
  it("defaults the pattern to the plain title", () => {
    expect(expandBulkCreate({ titles: ["A"], moduleIds: ["hire"], phaseIds: ["sit1"], pattern: "  " }, names)[0].title).toBe("A");
  });
});

describe("bulkRowKey", () => {
  it("is case-insensitive on title and distinguishes module/phase", () => {
    expect(bulkRowKey({ title: "Hire A", moduleId: "m", phaseId: "p" })).toBe(bulkRowKey({ title: " hire a", moduleId: "m", phaseId: "p" }));
    expect(bulkRowKey({ title: "Hire A", moduleId: "m", phaseId: null })).not.toBe(bulkRowKey({ title: "Hire A", moduleId: "m", phaseId: "p" }));
  });
});
