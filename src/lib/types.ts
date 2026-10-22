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
  /** Organisation name (e.g. the consultancy or a customer) */
  organization?: string | null;
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
  /** Only approved test scripts can be planned in this phase */
  requireApprovedScripts?: boolean;
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

export interface NotificationView {
  id: string;
  /** ASSIGNED | MENTIONED | STATE_CHANGED | COMMENTED | RETEST */
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  workItemId: number | null;
  itemTitle: string | null;
  projectId: string | null;
  actor: { id: string; name: string; color: string } | null;
}

export interface SavedQueryView {
  id: string;
  name: string;
  shared: boolean;
  mode: "FLAT" | "TREE";
  definition: import("./query").QueryDefinition;
  columns: string[];
  ownerId: string;
  ownerName: string;
  updatedAt: string;
}

/** The current user's permissions in a project, as sent to the browser. */
export interface ClientAccess {
  permissions: import("./permissions").Permission[];
  roleName: string | null;
  isAdmin: boolean;
}
