import type { ItemView, TypeLite, ModuleLite } from "@/lib/types";
import { DEFAULT_DEFECT_WORKFLOW, DEFAULT_TEST_TASK_WORKFLOW } from "@/lib/workflow";
import type { QueryContext } from "@/lib/query";
import { buildModuleSubtree } from "@/lib/query";

export const defectType: TypeLite = {
  id: "t-def",
  key: "DEFECT",
  name: "Defect",
  icon: "🐞",
  color: "#dc2626",
  states: DEFAULT_DEFECT_WORKFLOW.states.map((s, i) => ({ name: s.name, category: s.category, color: s.color ?? "#000", order: i })),
  transitions: DEFAULT_DEFECT_WORKFLOW.transitions ?? {},
  fields: [],
  disabled: false,
};

export const testType: TypeLite = {
  id: "t-tt",
  key: "TEST_TASK",
  name: "Test Task",
  icon: "✔",
  color: "#2563eb",
  states: DEFAULT_TEST_TASK_WORKFLOW.states.map((s, i) => ({ name: s.name, category: s.category, color: s.color ?? "#000", order: i })),
  transitions: {},
  fields: [],
  disabled: false,
};

export const modules: ModuleLite[] = [
  { id: "ec", name: "Employee Central", parentId: null, order: 0, path: "Employee Central" },
  { id: "hire", name: "Hire", parentId: "ec", order: 0, path: "Employee Central > Hire" },
  { id: "term", name: "Termination", parentId: "ec", order: 1, path: "Employee Central > Termination" },
  { id: "rec", name: "Recruiting", parentId: null, order: 1, path: "Recruiting" },
];

export function ctx(overrides: Partial<QueryContext> = {}): QueryContext {
  return {
    currentUserId: "u1",
    now: new Date("2026-10-15T10:00:00"),
    types: new Map([
      [defectType.id, defectType],
      [testType.id, testType],
    ]),
    moduleSubtree: buildModuleSubtree(modules),
    ...overrides,
  };
}

let nextId = 1;
export function item(p: Partial<ItemView> = {}): ItemView {
  return {
    id: nextId++,
    typeId: defectType.id,
    title: "Item",
    state: "New",
    columnDone: false,
    assignedToId: null,
    moduleId: null,
    phaseId: null,
    parentId: null,
    priority: 2,
    severity: null,
    tags: [],
    dueDate: null,
    boardOrder: 0,
    commentCount: 0,
    childTotal: 0,
    childDone: 0,
    linkCount: 0,
    createdById: "u1",
    createdAt: "2026-10-01T09:00:00.000Z",
    changedAt: "2026-10-01T09:00:00.000Z",
    stateChangedAt: "2026-10-01T09:00:00.000Z",
    fields: {},
    descriptionText: "",
    ...p,
  };
}
