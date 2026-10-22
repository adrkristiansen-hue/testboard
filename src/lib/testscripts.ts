// Test scripts and test execution: statuses, outcomes, retests and defect pre-fill (pure, unit-tested).
import type { TestStep } from "./fields";
import type { RtDoc, RtNode } from "./richtext";

export const SCRIPT_STATUSES = ["DRAFT", "APPROVED", "RETIRED"] as const;
export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

export const STEP_OUTCOMES = ["Passed", "Failed", "Blocked", "Skipped"] as const;
export type StepOutcome = (typeof STEP_OUTCOMES)[number];
export type RunOutcome = "Passed" | "Failed" | "Blocked";

/** Inputs a new script asks for, so every run records which test user was used. */
export const DEFAULT_SCRIPT_INPUTS = ["Test user"];

export const scriptKey = (n: number) => `TS-${n}`;

export function parseSteps(json: unknown): TestStep[] {
  const v = typeof json === "string" ? safeJson(json) : json;
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ action: typeof s.action === "string" ? s.action : "", expected: typeof s.expected === "string" ? s.expected : "" }));
}

export function parseInputs(json: unknown): string[] {
  const v = typeof json === "string" ? safeJson(json) : json;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Steps without any text are dropped when a script is saved. */
export function cleanSteps(steps: TestStep[]): TestStep[] {
  return steps.map((s) => ({ action: s.action.trim(), expected: s.expected.trim() })).filter((s) => s.action || s.expected);
}

export function cleanInputs(inputs: string[]): string[] {
  const out: string[] = [];
  for (const raw of inputs) {
    const v = raw.trim().slice(0, 60);
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

export interface ScriptContent {
  title: string;
  moduleId: string | null;
  role: string;
  preconditions: string;
  testData: string;
  inputs: string[];
  steps: TestStep[];
}

export function sameContent(a: ScriptContent, b: ScriptContent): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(c: ScriptContent) {
  return [c.title.trim(), c.moduleId ?? null, c.role.trim(), c.preconditions.trim(), c.testData.trim(), cleanInputs(c.inputs), cleanSteps(c.steps)];
}

/**
 * Editing an approved script makes a new version that has to be approved again.
 * Runs already planned keep the version they copied.
 */
export function afterEdit(current: { status: ScriptStatus; version: number }, changed: boolean): { status: ScriptStatus; version: number; clearApproval: boolean } {
  if (!changed) return { status: current.status, version: current.version, clearApproval: false };
  if (current.status === "APPROVED") return { status: "DRAFT", version: current.version + 1, clearApproval: true };
  return { status: current.status, version: current.version, clearApproval: false };
}

export type PlanBlock = "RETIRED" | "NOT_APPROVED" | "NO_STEPS";

/** Why a script cannot be planned in a phase, or null when it can. */
export function planBlock(script: { status: ScriptStatus; stepCount: number }, phase: { requireApprovedScripts: boolean } | null): PlanBlock | null {
  if (script.status === "RETIRED") return "RETIRED";
  if (script.stepCount === 0) return "NO_STEPS";
  if (phase?.requireApprovedScripts && script.status !== "APPROVED") return "NOT_APPROVED";
  return null;
}

/** Every input needs a value before the tester can record results. */
export function missingInputs(labels: string[], values: Record<string, string>): string[] {
  return labels.filter((l) => !(values[l] ?? "").trim());
}

export interface StepResultLike {
  stepIndex: number;
  outcome: StepOutcome;
}

/**
 * The outcome of an attempt so far:
 * - any failed step → Failed (the tester may finish early);
 * - otherwise any blocked step → Blocked (may finish early);
 * - all steps recorded with at least one passed → Passed;
 * - otherwise null (not finished yet).
 */
export function attemptOutcome(results: StepResultLike[], stepCount: number): RunOutcome | null {
  const byStep = new Map(results.filter((r) => r.stepIndex >= 0 && r.stepIndex < stepCount).map((r) => [r.stepIndex, r.outcome]));
  const values = [...byStep.values()];
  if (values.includes("Failed")) return "Failed";
  if (values.includes("Blocked")) return "Blocked";
  if (stepCount > 0 && byStep.size === stepCount && values.includes("Passed")) return "Passed";
  return null;
}

/** The step to show first: the first one without a result (or the last step when all are done). */
export function nextStepIndex(results: StepResultLike[], stepCount: number): number {
  const done = new Set(results.map((r) => r.stepIndex));
  for (let i = 0; i < stepCount; i++) if (!done.has(i)) return i;
  return Math.max(0, stepCount - 1);
}

/**
 * A retest starts at the step that failed or was blocked: earlier passed/skipped steps are carried over
 * from the previous attempt and the rest is tested again.
 */
export function carriedResults<T extends StepResultLike>(previous: T[], stepCount: number): T[] {
  const sorted = [...previous].filter((r) => r.stepIndex < stepCount).sort((a, b) => a.stepIndex - b.stepIndex);
  const out: T[] = [];
  for (let i = 0; i < stepCount; i++) {
    const r = sorted.find((x) => x.stepIndex === i);
    if (!r || (r.outcome !== "Passed" && r.outcome !== "Skipped")) break;
    out.push(r);
  }
  return out;
}

/** A failed run is ready for retest when everything raised from it as a defect is fixed or closed. */
export function readyForRetest(runState: string, defects: { category: string }[]): boolean {
  if (runState !== "Failed" && runState !== "Blocked") return false;
  return defects.length > 0 && defects.every((d) => d.category === "RESOLVED" || d.category === "COMPLETED" || d.category === "REMOVED");
}

// ---------------------------------------------------------------------------
// Pre-fill for defects and change requests raised from a step
// ---------------------------------------------------------------------------

export interface RaiseContext {
  runId: number;
  runTitle: string;
  scriptKey: string | null;
  preconditions: string;
  testData: string;
  inputs: Record<string, string>;
  steps: TestStep[];
  stepIndex: number;
  actual: string;
}

const para = (text: string): RtNode => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const bold = (label: string, text: string): RtNode => ({
  type: "paragraph",
  content: [{ type: "text", text: `${label}: `, marks: [{ type: "bold" }] }, ...(text ? [{ type: "text", text }] : [])],
});
const doc = (...content: RtNode[]): RtDoc => ({ type: "doc", content });

export function raisedTitle(ctx: RaiseContext, kind: "DEFECT" | "CHANGE_REQUEST"): string {
  const step = ctx.steps[ctx.stepIndex];
  const what = (ctx.actual.trim() || step?.expected || step?.action || ctx.runTitle).split("\n")[0].trim();
  const ref = `${ctx.scriptKey ?? `#${ctx.runId}`} step ${ctx.stepIndex + 1}`;
  const prefix = kind === "CHANGE_REQUEST" ? "Change: " : "";
  return `${prefix}${what}`.slice(0, 200 - ref.length - 3) + ` (${ref})`;
}

/** Steps to reproduce: preconditions, test users and data, then every step up to the failing one. */
export function stepsToReproduce(ctx: RaiseContext): RtDoc {
  const content: RtNode[] = [];
  if (ctx.preconditions.trim()) content.push(bold("Preconditions", ctx.preconditions.trim()));
  for (const [label, value] of Object.entries(ctx.inputs)) if (value.trim()) content.push(bold(label, value.trim()));
  if (ctx.testData.trim()) content.push(bold("Test data", ctx.testData.trim()));
  const upTo = ctx.steps.slice(0, ctx.stepIndex + 1);
  if (upTo.length) {
    content.push({
      type: "orderedList",
      content: upTo.map((s, i) => ({
        type: "listItem",
        content: [i === ctx.stepIndex ? { type: "paragraph", content: [{ type: "text", text: s.action || "(no action)", marks: [{ type: "bold" }] }] } : para(s.action)],
      })),
    });
  }
  content.push(para(`Found in test run #${ctx.runId}${ctx.scriptKey ? ` (${ctx.scriptKey})` : ""}, step ${ctx.stepIndex + 1}.`));
  return doc(...content);
}

export function raisedFields(ctx: RaiseContext, kind: "DEFECT" | "CHANGE_REQUEST"): Record<string, unknown> {
  const step = ctx.steps[ctx.stepIndex];
  if (kind === "CHANGE_REQUEST") {
    return {
      justification: doc(
        para(`Raised during test run #${ctx.runId}${ctx.scriptKey ? ` (${ctx.scriptKey})` : ""}, step ${ctx.stepIndex + 1}: ${step?.action ?? ""}`.trim()),
        bold("Today", ctx.actual.trim()),
        bold("Script expects", step?.expected ?? ""),
      ),
      decision: "Pending",
    };
  }
  return {
    stepsToReproduce: stepsToReproduce(ctx),
    expected: doc(para(step?.expected ?? "")),
    actual: doc(para(ctx.actual.trim())),
    environment: "TEST",
  };
}
