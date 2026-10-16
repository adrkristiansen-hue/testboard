// Default process for new projects: work item types, workflows and board columns.
import { DEFAULT_TYPE_FIELDS, type FieldDef } from "./fields";
import {
  DEFAULT_DEFECT_WORKFLOW,
  DEFAULT_QUESTION_WORKFLOW,
  DEFAULT_SIMPLE_WORKFLOW,
  DEFAULT_TEST_TASK_WORKFLOW,
  type WorkflowDef,
} from "./workflow";

export interface TypeTemplate {
  key: string;
  name: string;
  icon: string;
  color: string;
  workflow: WorkflowDef;
  fields: FieldDef[];
}

export const DEFAULT_TYPES: TypeTemplate[] = [
  { key: "TEST_TASK", name: "Test Task", icon: "✓", color: "#0284c7", workflow: DEFAULT_TEST_TASK_WORKFLOW, fields: DEFAULT_TYPE_FIELDS.TEST_TASK },
  { key: "DEFECT", name: "Defect", icon: "✱", color: "#dc2626", workflow: DEFAULT_DEFECT_WORKFLOW, fields: DEFAULT_TYPE_FIELDS.DEFECT },
  { key: "QUESTION", name: "Question", icon: "?", color: "#d97706", workflow: DEFAULT_QUESTION_WORKFLOW, fields: DEFAULT_TYPE_FIELDS.QUESTION },
  { key: "CHANGE_REQUEST", name: "Change Request", icon: "Δ", color: "#7c3aed", workflow: DEFAULT_SIMPLE_WORKFLOW, fields: DEFAULT_TYPE_FIELDS.CHANGE_REQUEST },
  { key: "TASK", name: "Task", icon: "□", color: "#475569", workflow: DEFAULT_SIMPLE_WORKFLOW, fields: DEFAULT_TYPE_FIELDS.TASK },
];

export interface ColumnTemplate {
  name: string;
  wipLimit: number | null;
  split: boolean;
  /** type key -> states */
  states: Record<string, string[]>;
}

export const DEFAULT_COLUMNS: ColumnTemplate[] = [
  {
    name: "To do",
    wipLimit: null,
    split: false,
    states: { TEST_TASK: ["Not started"], DEFECT: ["New"], QUESTION: ["Open"], CHANGE_REQUEST: ["New"], TASK: ["New"] },
  },
  {
    name: "In progress",
    wipLimit: 8,
    split: true,
    states: { TEST_TASK: ["In test"], DEFECT: ["Active"], QUESTION: ["Awaiting answer"], CHANGE_REQUEST: ["Active"], TASK: ["Active"] },
  },
  {
    name: "Failed / Blocked",
    wipLimit: 4,
    split: false,
    states: { TEST_TASK: ["Failed", "Blocked"] },
  },
  {
    name: "Fixed / Retest",
    wipLimit: 6,
    split: false,
    states: { DEFECT: ["Fixed", "Ready for retest"], QUESTION: ["Answered"], CHANGE_REQUEST: ["Resolved"], TASK: ["Resolved"] },
  },
  {
    name: "Done",
    wipLimit: null,
    split: false,
    states: { TEST_TASK: ["Passed"], DEFECT: ["Closed", "Rejected"], QUESTION: ["Closed"], CHANGE_REQUEST: ["Closed", "Removed"], TASK: ["Closed", "Removed"] },
  },
];

/** Convert a column template (type keys) into a stateMap keyed by type ids. */
export function columnStateMap(template: ColumnTemplate, typeIdByKey: Map<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, states] of Object.entries(template.states)) {
    const id = typeIdByKey.get(key);
    if (id) out[id] = states;
  }
  return out;
}

/** The "natural" forward path through each default workflow (used for seeding history). */
export function naturalPath(typeKey: string, finalState: string): string[] {
  const paths: Record<string, string[]> = {
    TEST_TASK: ["Not started", "In test"],
    DEFECT: ["New", "Active", "Fixed", "Ready for retest", "Closed"],
    QUESTION: ["Open", "Awaiting answer", "Answered", "Closed"],
    CHANGE_REQUEST: ["New", "Active", "Resolved", "Closed"],
    TASK: ["New", "Active", "Resolved", "Closed"],
  };
  const base = paths[typeKey] ?? [finalState];
  const idx = base.indexOf(finalState);
  if (idx >= 0) return base.slice(0, idx + 1);
  // Terminal states off the main path (Passed/Failed/Blocked, Rejected, Removed)
  if (typeKey === "TEST_TASK") return [...base, finalState];
  return [base[0], finalState];
}
