import { describe, expect, it } from "vitest";
import { defectDefaultsFromTest } from "@/lib/prefill";
import type { RtDoc } from "@/lib/richtext";
import { defectType, testType } from "./fixtures";

const test = {
  id: 7,
  title: "Hire temporary employee",
  moduleId: "hire",
  phaseId: "sit2",
  priority: 1,
  tags: ["regression"],
  fields: { steps: [{ action: "Open Add New Employee", expected: "Form opens" }, { action: "Save", expected: "Saved" }], expectedResult: "End date is stored", outcome: "Failed" },
};

describe("defectDefaultsFromTest", () => {
  it("copies context from the failed test and links it as parent", () => {
    const d = defectDefaultsFromTest(test, [testType, defectType]);
    expect(d).toMatchObject({ typeId: defectType.id, title: "Defect: Hire temporary employee", moduleId: "hire", phaseId: "sit2", parentId: 7, priority: 1, tags: ["regression"] });
  });
  it("turns test steps into numbered steps to reproduce", () => {
    const doc = defectDefaultsFromTest(test, [defectType]).fields!.stepsToReproduce as RtDoc;
    const list = doc.content![0];
    expect(list.type).toBe("orderedList");
    expect(list.content).toHaveLength(2);
  });
  it("accepts expected result as plain text or rich text", () => {
    const plain = defectDefaultsFromTest(test, [defectType]).fields!.expected as RtDoc;
    expect(JSON.stringify(plain)).toContain("End date is stored");
    const rich: RtDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Rich" }] }] };
    expect(defectDefaultsFromTest({ ...test, fields: { expectedResult: rich } }, [defectType]).fields!.expected).toEqual(rich);
    expect(defectDefaultsFromTest({ ...test, fields: {} }, [defectType]).fields!.expected).toBeUndefined();
  });
});
