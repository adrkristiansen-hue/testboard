import { describe, expect, it } from "vitest";
import {
  allowedTargets,
  categoryOf,
  checkTransition,
  DEFAULT_DEFECT_WORKFLOW,
  DEFAULT_TEST_TASK_WORKFLOW,
  initialState,
  isDone,
  validateWorkflow,
} from "@/lib/workflow";
import { outcomeForTestState } from "@/lib/fields";

describe("state categories", () => {
  it("maps default defect states to categories", () => {
    expect(categoryOf(DEFAULT_DEFECT_WORKFLOW, "New")).toBe("PROPOSED");
    expect(categoryOf(DEFAULT_DEFECT_WORKFLOW, "Active")).toBe("IN_PROGRESS");
    expect(categoryOf(DEFAULT_DEFECT_WORKFLOW, "Fixed")).toBe("RESOLVED");
    expect(categoryOf(DEFAULT_DEFECT_WORKFLOW, "Ready for retest")).toBe("RESOLVED");
    expect(categoryOf(DEFAULT_DEFECT_WORKFLOW, "Closed")).toBe("COMPLETED");
    expect(categoryOf(DEFAULT_DEFECT_WORKFLOW, "Rejected")).toBe("REMOVED");
    expect(categoryOf(DEFAULT_DEFECT_WORKFLOW, "Nope")).toBeUndefined();
  });

  it("treats completed and removed as done, resolved as not done", () => {
    expect(isDone(DEFAULT_DEFECT_WORKFLOW, "Closed")).toBe(true);
    expect(isDone(DEFAULT_DEFECT_WORKFLOW, "Rejected")).toBe(true);
    expect(isDone(DEFAULT_DEFECT_WORKFLOW, "Fixed")).toBe(false);
  });

  it("uses the first proposed state as initial state", () => {
    expect(initialState(DEFAULT_DEFECT_WORKFLOW)).toBe("New");
    expect(initialState(DEFAULT_TEST_TASK_WORKFLOW)).toBe("Not started");
  });
});

describe("transitions", () => {
  it("allows any transition when no map is defined", () => {
    expect(checkTransition(DEFAULT_TEST_TASK_WORKFLOW, "Not started", "Passed")).toEqual({ ok: true });
    expect(checkTransition(DEFAULT_TEST_TASK_WORKFLOW, "Failed", "In test")).toEqual({ ok: true });
  });

  it("enforces the defect transition map", () => {
    expect(checkTransition(DEFAULT_DEFECT_WORKFLOW, "New", "Active").ok).toBe(true);
    expect(checkTransition(DEFAULT_DEFECT_WORKFLOW, "New", "Fixed")).toEqual({ ok: false, reason: "NOT_ALLOWED" });
    expect(checkTransition(DEFAULT_DEFECT_WORKFLOW, "Fixed", "Ready for retest").ok).toBe(true);
    expect(checkTransition(DEFAULT_DEFECT_WORKFLOW, "Ready for retest", "Active").ok).toBe(true);
  });

  it("rejects unknown and same-state targets", () => {
    expect(checkTransition(DEFAULT_DEFECT_WORKFLOW, "New", "Done")).toEqual({ ok: false, reason: "UNKNOWN_STATE" });
    expect(checkTransition(DEFAULT_DEFECT_WORKFLOW, "New", "New")).toEqual({ ok: false, reason: "SAME_STATE" });
  });

  it("treats states missing from the map as unrestricted", () => {
    const wf = { ...DEFAULT_DEFECT_WORKFLOW, transitions: { New: ["Active"] } };
    expect(checkTransition(wf, "Fixed", "New").ok).toBe(true);
    expect(checkTransition(wf, "New", "Closed").ok).toBe(false);
  });

  it("lists allowed targets in workflow order", () => {
    expect(allowedTargets(DEFAULT_DEFECT_WORKFLOW, "Fixed")).toEqual(["Active", "Ready for retest", "Closed"]);
  });
});

describe("validateWorkflow", () => {
  it("accepts the defaults", () => {
    expect(validateWorkflow(DEFAULT_DEFECT_WORKFLOW)).toEqual([]);
    expect(validateWorkflow(DEFAULT_TEST_TASK_WORKFLOW)).toEqual([]);
  });

  it("reports duplicates, missing categories and bad transitions", () => {
    const problems = validateWorkflow({
      states: [
        { name: "A", category: "IN_PROGRESS" },
        { name: "A", category: "IN_PROGRESS" },
      ],
      transitions: { A: ["Z"] },
    });
    expect(problems.join("|")).toMatch(/Duplicate/);
    expect(problems.join("|")).toMatch(/Proposed/);
    expect(problems.join("|")).toMatch(/Completed/);
    expect(problems.join("|")).toMatch(/unknown state "Z"/);
  });
});

describe("test outcome sync", () => {
  it("maps test task states to outcomes", () => {
    expect(outcomeForTestState("Passed")).toBe("Passed");
    expect(outcomeForTestState("Blocked")).toBe("Blocked");
    expect(outcomeForTestState("Not started")).toBe("Not run");
    expect(outcomeForTestState("In test")).toBeUndefined();
  });
});
