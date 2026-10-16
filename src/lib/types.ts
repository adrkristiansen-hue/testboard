// Plain, serialisable shapes shared by server and client code.
import type { StateCategory } from "./workflow";
import type { FieldDef } from "./fields";

export type Role = "ADMIN" | "TEST_LEAD" | "MEMBER" | "READ_ONLY";
export const ROLES: Role[] = ["ADMIN", "TEST_LEAD", "MEMBER", "READ_ONLY"];

export interface UserLite {
  id: string;
  name: string;
  email: string;
  color: string;
  role: Role;
}

export interface TeamLite {
  id: string;
  name: string;
}

export interface ModuleLite {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  /** Full path, e.g. "Employee Central > Hire" */
  path: string;
}

export interface PhaseLite {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  order: number;
}

export interface StateLite {
  name: string;
  category: StateCategory;
  color: string;
  order: number;
}

export interface TypeLite {
  id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  states: StateLite[];
  transitions: Record<string, string[]>;
  fields: FieldDef[];
  disabled: boolean;
}

/** Work item as rendered on boards and lists. */
export interface ItemView {
  id: number;
  typeId: string;
  title: string;
  state: string;
  columnDone: boolean;
  assignedToId: string | null;
  moduleId: string | null;
  phaseId: string | null;
  parentId: number | null;
  priority: number;
  severity: number | null;
  tags: string[];
  dueDate: string | null;
  boardOrder: number;
  commentCount: number;
  childTotal: number;
  childDone: number;
  linkCount: number;
  createdById: string;
  createdAt: string;
  changedAt: string;
  stateChangedAt: string;
  fields: Record<string, unknown>;
  descriptionText?: string | null;
}

export interface ProjectMeta {
  id: string;
  key: string;
  name: string;
  modules: ModuleLite[];
  phases: PhaseLite[];
  types: TypeLite[];
  users: UserLite[];
  teams: TeamLite[];
}

export function canEdit(role: Role | string): boolean {
  return role !== "READ_ONLY";
}
export function canConfigure(role: Role | string): boolean {
  return role === "ADMIN" || role === "TEST_LEAD";
}
export function isAdmin(role: Role | string): boolean {
  return role === "ADMIN";
}
