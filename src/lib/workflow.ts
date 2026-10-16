// Workflow ("pipeline") rules: ordered states per work item type, each mapped to
// an Azure Boards-style state category.

export const STATE_CATEGORIES = ["PROPOSED", "IN_PROGRESS", "RESOLVED", "COMPLETED", "REMOVED"] as const;
export type StateCategory = (typeof STATE_CATEGORIES)[number];

export interface StateDef {
  name: string;
  category: StateCategory;
  color?: string;
  order?: number;
}

/** Optional restriction map: from-state -> allowed target states. Empty map = any transition. */
export type TransitionMap = Record<string, string[]>;

export interface WorkflowDef {
  states: StateDef[];
  transitions?: TransitionMap;
}

export const CATEGORY_COLORS: Record<StateCategory, string> = {
  PROPOSED: "#94a3b8",
  IN_PROGRESS: "#2563eb",
  RESOLVED: "#7c3aed",
  COMPLETED: "#16a34a",
  REMOVED: "#64748b",
};

export function isStateCategory(value: string): value is StateCategory {
  return (STATE_CATEGORIES as readonly string[]).includes(value);
}

export function orderedStates(wf: WorkflowDef): StateDef[] {
  return [...wf.states].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function initialState(wf: WorkflowDef): string {
  const states = orderedStates(wf);
  const proposed = states.find((s) => s.category === "PROPOSED");
  const first = proposed ?? states[0];
  if (!first) throw new Error("Workflow has no states");
  return first.name;
}

export function categoryOf(wf: WorkflowDef, state: string): StateCategory | undefined {
  return wf.states.find((s) => s.name === state)?.category;
}

/** Completed or Removed: no further work expected. */
export function isClosedCategory(category: StateCategory | undefined): boolean {
  return category === "COMPLETED" || category === "REMOVED";
}

/** "Done" for progress roll-ups (e.g. 2/5 defects closed). Resolved counts as not yet done. */
export function isDone(wf: WorkflowDef, state: string): boolean {
  return isClosedCategory(categoryOf(wf, state));
}

export type TransitionCheck = { ok: true } | { ok: false; reason: "UNKNOWN_STATE" | "NOT_ALLOWED" | "SAME_STATE" };

export function checkTransition(wf: WorkflowDef, from: string, to: string): TransitionCheck {
  if (!wf.states.some((s) => s.name === to)) return { ok: false, reason: "UNKNOWN_STATE" };
  if (from === to) return { ok: false, reason: "SAME_STATE" };
  const map = wf.transitions ?? {};
  if (Object.keys(map).length === 0) return { ok: true };
  // If the from-state has no entry, it is unrestricted.
  const allowed = map[from];
  if (!allowed) return { ok: true };
  return allowed.includes(to) ? { ok: true } : { ok: false, reason: "NOT_ALLOWED" };
}

export function allowedTargets(wf: WorkflowDef, from: string): string[] {
  return orderedStates(wf)
    .map((s) => s.name)
    .filter((name) => checkTransition(wf, from, name).ok);
}

/** Validate a workflow definition edited by an admin. Returns a list of problems. */
export function validateWorkflow(wf: WorkflowDef): string[] {
  const problems: string[] = [];
  if (wf.states.length === 0) problems.push("A workflow needs at least one state.");
  const names = new Set<string>();
  for (const s of wf.states) {
    if (!s.name.trim()) problems.push("State names cannot be empty.");
    if (names.has(s.name)) problems.push(`Duplicate state "${s.name}".`);
    names.add(s.name);
    if (!isStateCategory(s.category)) problems.push(`Invalid category for "${s.name}".`);
  }
  if (!wf.states.some((s) => s.category === "PROPOSED")) problems.push("At least one state must be in the Proposed category.");
  if (!wf.states.some((s) => s.category === "COMPLETED")) problems.push("At least one state must be in the Completed category.");
  for (const [from, tos] of Object.entries(wf.transitions ?? {})) {
    if (!names.has(from)) problems.push(`Transition from unknown state "${from}".`);
    for (const t of tos) if (!names.has(t)) problems.push(`Transition to unknown state "${t}".`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Default process (used by seed and "new project")
// ---------------------------------------------------------------------------

export const DEFAULT_DEFECT_WORKFLOW: WorkflowDef = {
  states: [
    { name: "New", category: "PROPOSED", order: 0, color: "#94a3b8" },
    { name: "Active", category: "IN_PROGRESS", order: 1, color: "#2563eb" },
    { name: "Fixed", category: "RESOLVED", order: 2, color: "#7c3aed" },
    { name: "Ready for retest", category: "RESOLVED", order: 3, color: "#a855f7" },
    { name: "Closed", category: "COMPLETED", order: 4, color: "#16a34a" },
    { name: "Rejected", category: "REMOVED", order: 5, color: "#64748b" },
  ],
  transitions: {
    New: ["Active", "Rejected", "Closed"],
    Active: ["New", "Fixed", "Rejected"],
    Fixed: ["Active", "Ready for retest", "Closed"],
    "Ready for retest": ["Active", "Closed"],
    Closed: ["Active"],
    Rejected: ["New", "Active"],
  },
};

export const DEFAULT_TEST_TASK_WORKFLOW: WorkflowDef = {
  states: [
    { name: "Not started", category: "PROPOSED", order: 0, color: "#94a3b8" },
    { name: "In test", category: "IN_PROGRESS", order: 1, color: "#2563eb" },
    { name: "Passed", category: "COMPLETED", order: 2, color: "#16a34a" },
    { name: "Failed", category: "IN_PROGRESS", order: 3, color: "#dc2626" },
    { name: "Blocked", category: "IN_PROGRESS", order: 4, color: "#f59e0b" },
  ],
};

export const DEFAULT_SIMPLE_WORKFLOW: WorkflowDef = {
  states: [
    { name: "New", category: "PROPOSED", order: 0, color: "#94a3b8" },
    { name: "Active", category: "IN_PROGRESS", order: 1, color: "#2563eb" },
    { name: "Resolved", category: "RESOLVED", order: 2, color: "#7c3aed" },
    { name: "Closed", category: "COMPLETED", order: 3, color: "#16a34a" },
    { name: "Removed", category: "REMOVED", order: 4, color: "#64748b" },
  ],
};

export const DEFAULT_QUESTION_WORKFLOW: WorkflowDef = {
  states: [
    { name: "Open", category: "PROPOSED", order: 0, color: "#94a3b8" },
    { name: "Awaiting answer", category: "IN_PROGRESS", order: 1, color: "#f59e0b" },
    { name: "Answered", category: "RESOLVED", order: 2, color: "#7c3aed" },
    { name: "Closed", category: "COMPLETED", order: 3, color: "#16a34a" },
  ],
};
