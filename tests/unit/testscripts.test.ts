import { describe, expect, it } from "vitest";
import {
  afterEdit,
  attemptOutcome,
  carriedResults,
  cleanInputs,
  cleanSteps,
  missingInputs,
  nextStepIndex,
  parseSteps,
  planBlock,
  raisedFields,
  raisedTitle,
  readyForRetest,
  sameContent,
  stepsToReproduce,
  type RaiseContext,
  type StepOutcome,
} from "@/lib/testscripts";
import { docToText } from "@/lib/richtext";

const r = (stepIndex: number, outcome: StepOutcome) => ({ stepIndex, outcome });

describe("script content", () => {
  it("parses steps defensively", () => {
    expect(parseSteps('[{"action":"a","expected":"b"},null,{"action":3}]')).toEqual([
      { action: "a", expected: "b" },
      { action: "", expected: "" },
    ]);
    expect(parseSteps("not json")).toEqual([]);
  });
  it("drops empty steps and duplicate inputs", () => {
    expect(cleanSteps([{ action: " Open ", expected: "" }, { action: " ", expected: " " }])).toEqual([{ action: "Open", expected: "" }]);
    expect(cleanInputs(["Test user", " test user ", "", "Manager"])).toEqual(["Test user", "Manager"]);
  });
  it("compares content ignoring whitespace", () => {
    const base = { title: "Hire", moduleId: null, role: "", preconditions: "", testData: "", inputs: ["Test user"], steps: [{ action: "a", expected: "b" }] };
    expect(sameContent(base, { ...base, title: " Hire " })).toBe(true);
    expect(sameContent(base, { ...base, steps: [{ action: "a", expected: "c" }] })).toBe(false);
  });
});

describe("versions and approval", () => {
  it("editing an approved script starts a new draft version", () => {
    expect(afterEdit({ status: "APPROVED", version: 2 }, true)).toEqual({ status: "DRAFT", version: 3, clearApproval: true });
    expect(afterEdit({ status: "APPROVED", version: 2 }, false)).toEqual({ status: "APPROVED", version: 2, clearApproval: false });
    expect(afterEdit({ status: "DRAFT", version: 1 }, true)).toEqual({ status: "DRAFT", version: 1, clearApproval: false });
  });
  it("only approved scripts can be planned in phases that require it", () => {
    const uat = { requireApprovedScripts: true };
    const sit = { requireApprovedScripts: false };
    expect(planBlock({ status: "DRAFT", stepCount: 3 }, uat)).toBe("NOT_APPROVED");
    expect(planBlock({ status: "DRAFT", stepCount: 3 }, sit)).toBeNull();
    expect(planBlock({ status: "APPROVED", stepCount: 3 }, uat)).toBeNull();
    expect(planBlock({ status: "RETIRED", stepCount: 3 }, sit)).toBe("RETIRED");
    expect(planBlock({ status: "APPROVED", stepCount: 0 }, null)).toBe("NO_STEPS");
  });
});

describe("execution", () => {
  it("requires every input (test user) before starting", () => {
    expect(missingInputs(["Test user", "Manager"], { "Test user": "emp 1001", Manager: "  " })).toEqual(["Manager"]);
    expect(missingInputs([], {})).toEqual([]);
  });
  it("computes the outcome of an attempt", () => {
    expect(attemptOutcome([r(0, "Passed"), r(1, "Passed")], 3)).toBeNull();
    expect(attemptOutcome([r(0, "Passed"), r(1, "Skipped"), r(2, "Passed")], 3)).toBe("Passed");
    expect(attemptOutcome([r(0, "Skipped")], 1)).toBeNull();
    expect(attemptOutcome([r(0, "Passed"), r(1, "Failed")], 3)).toBe("Failed");
    expect(attemptOutcome([r(0, "Blocked"), r(1, "Failed")], 3)).toBe("Failed");
    expect(attemptOutcome([r(0, "Blocked")], 3)).toBe("Blocked");
    expect(attemptOutcome([r(5, "Failed")], 3)).toBeNull();
  });
  it("finds the next step to test", () => {
    expect(nextStepIndex([r(0, "Passed"), r(2, "Passed")], 4)).toBe(1);
    expect(nextStepIndex([r(0, "Passed"), r(1, "Passed")], 2)).toBe(1);
    expect(nextStepIndex([], 0)).toBe(0);
  });
  it("a retest carries over the steps before the failure", () => {
    expect(carriedResults([r(0, "Passed"), r(1, "Skipped"), r(2, "Failed"), r(3, "Passed")], 4)).toEqual([r(0, "Passed"), r(1, "Skipped")]);
    expect(carriedResults([r(0, "Blocked")], 2)).toEqual([]);
    expect(carriedResults([r(1, "Passed")], 2)).toEqual([]);
  });
  it("is ready for retest when all raised defects are fixed", () => {
    expect(readyForRetest("Failed", [{ category: "RESOLVED" }, { category: "COMPLETED" }])).toBe(true);
    expect(readyForRetest("Failed", [{ category: "RESOLVED" }, { category: "IN_PROGRESS" }])).toBe(false);
    expect(readyForRetest("Failed", [])).toBe(false);
    expect(readyForRetest("Passed", [{ category: "RESOLVED" }])).toBe(false);
  });
});

describe("raising defects and change requests from a step", () => {
  const ctx: RaiseContext = {
    runId: 42,
    runTitle: "Hire temporary employee",
    scriptKey: "TS-3",
    preconditions: "Company NO01 exists",
    testData: "Contract 6 months",
    inputs: { "Test user": "emp 1001" },
    steps: [
      { action: "Start hire", expected: "Form opens" },
      { action: "Enter end date", expected: "Date accepted" },
      { action: "Save and reopen", expected: "End date shown" },
    ],
    stepIndex: 2,
    actual: "End date is empty\nafter save",
  };
  it("builds a title from the actual result with a script reference", () => {
    expect(raisedTitle(ctx, "DEFECT")).toBe("End date is empty (TS-3 step 3)");
    expect(raisedTitle({ ...ctx, actual: "" }, "CHANGE_REQUEST")).toBe("Change: End date shown (TS-3 step 3)");
    expect(raisedTitle({ ...ctx, actual: "x".repeat(300) }, "DEFECT").length).toBeLessThanOrEqual(200);
  });
  it("lists preconditions, test user, data and the steps up to the failure", () => {
    const text = docToText(stepsToReproduce(ctx));
    expect(text).toContain("Preconditions: Company NO01 exists");
    expect(text).toContain("Test user: emp 1001");
    expect(text).toContain("Test data: Contract 6 months");
    expect(text).toContain("Save and reopen");
    expect(text).toContain("Found in test run #42 (TS-3), step 3.");
  });
  it("fills expected/actual for defects and justification for change requests", () => {
    const d = raisedFields(ctx, "DEFECT");
    expect(docToText(d.expected as never)).toBe("End date shown");
    expect(docToText(d.actual as never)).toContain("End date is empty");
    const c = raisedFields(ctx, "CHANGE_REQUEST");
    expect(c.decision).toBe("Pending");
    expect(docToText(c.justification as never)).toContain("Script expects: End date shown");
  });
});
