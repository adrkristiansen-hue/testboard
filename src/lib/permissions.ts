// Project permissions: keys, default roles and the rules for what a change requires (pure, unit-tested).
import type { Role } from "./types";
import type { StateCategory } from "./workflow";

export const PERMISSIONS = [
  "items.view",
  "items.create",
  "items.editOwn",
  "items.edit",
  "items.changeState",
  "items.close",
  "items.assign",
  "items.delete",
  "comments.add",
  "comments.internal",
  "items.export",
  "items.import",
  "queries.share",
  "boards.configure",
  "project.configure",
  "access.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Grouping for the role editor. */
export const PERMISSION_GROUPS: { key: string; permissions: Permission[] }[] = [
  { key: "items", permissions: ["items.view", "items.create", "items.editOwn", "items.edit", "items.changeState", "items.close", "items.assign", "items.delete"] },
  { key: "collaboration", permissions: ["comments.add", "comments.internal", "queries.share"] },
  { key: "data", permissions: ["items.export", "items.import"] },
  { key: "admin", permissions: ["boards.configure", "project.configure", "access.manage"] },
];

/** Permissions a read-only account may never use, whatever its project role says. */
const WRITE_PERMISSIONS = new Set<Permission>(PERMISSIONS.filter((p) => p !== "items.view" && p !== "items.export"));

export interface RoleTemplate {
  key: "LEAD" | "CONSULTANT" | "CUSTOMER_TESTER" | "READER";
  name: string;
  nameNb: string;
  permissions: Permission[];
}

export const DEFAULT_ROLES: RoleTemplate[] = [
  { key: "LEAD", name: "Project lead", nameNb: "Prosjektleder", permissions: [...PERMISSIONS] },
  {
    key: "CONSULTANT",
    name: "Consultant",
    nameNb: "Konsulent",
    permissions: ["items.view", "items.create", "items.editOwn", "items.edit", "items.changeState", "items.close", "items.assign", "comments.add", "comments.internal", "items.export", "items.import", "boards.configure"],
  },
  {
    key: "CUSTOMER_TESTER",
    name: "Customer tester",
    nameNb: "Kundetester",
    // Customers report and test, comment and move their own work, but do not close, delete or see internal notes.
    permissions: ["items.view", "items.create", "items.editOwn", "items.changeState", "comments.add", "items.export"],
  },
  { key: "READER", name: "Read-only", nameNb: "Lesetilgang", permissions: ["items.view", "items.export"] },
];

export function parsePermissions(json: string | null | undefined): Permission[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)) : [];
  } catch {
    return [];
  }
}

/**
 * Effective permissions in a project.
 * - System admins have everything everywhere.
 * - Non-members have nothing.
 * - Read-only accounts are capped to viewing and exporting, whatever their role.
 */
export function effectivePermissions(globalRole: Role, rolePermissions: Permission[] | null): Set<Permission> {
  if (globalRole === "ADMIN") return new Set(PERMISSIONS);
  if (!rolePermissions) return new Set();
  const perms = new Set(rolePermissions);
  if (perms.size) perms.add("items.view");
  if (globalRole === "READ_ONLY") for (const p of WRITE_PERMISSIONS) perms.delete(p);
  return perms;
}

export interface ChangeLike {
  field: string;
  newValue?: string | null;
}

/**
 * Which permission each change needs. `newStateCategory` is the category of the target state
 * when the state changes. Editing fields needs "items.edit", or "items.editOwn" on own items.
 */
export function requiredPermissions(changes: ChangeLike[], ctx: { isOwnItem: boolean; newStateCategory?: StateCategory; userId?: string }): Permission[] {
  const need = new Set<Permission>();
  for (const c of changes) {
    if (c.field === "state") need.add(ctx.newStateCategory === "COMPLETED" || ctx.newStateCategory === "REMOVED" ? "items.close" : "items.changeState");
    else if (c.field === "columnDone" || c.field === "boardOrder") need.add("items.changeState");
    // Taking a work item yourself ("Assign to me") counts as moving work, not as assigning others.
    else if (c.field === "assignedToId") need.add(ctx.userId && c.newValue === ctx.userId ? "items.changeState" : "items.assign");
    else need.add(ctx.isOwnItem ? "items.editOwn" : "items.edit");
  }
  return [...need];
}

/** "items.edit" also covers own items. */
export function hasPermission(perms: ReadonlySet<Permission>, p: Permission): boolean {
  return perms.has(p) || (p === "items.editOwn" && perms.has("items.edit"));
}

export function missingPermissions(perms: ReadonlySet<Permission>, needed: Permission[]): Permission[] {
  return needed.filter((p) => !hasPermission(perms, p));
}

export interface BoardLock {
  teamId: string;
  restricted: boolean;
  /** Module ids the board shows (sub-modules already expanded) */
  moduleIds: ReadonlySet<string>;
  memberIds: ReadonlySet<string>;
}

/**
 * Modules hidden from a user: those shown on a locked board the user is not a member of,
 * unless another locked board the user *is* a member of also shows them.
 * Users with "access.manage" (and system admins) see everything.
 */
export function lockedModulesFor(userId: string, boards: BoardLock[], seesAll: boolean): Set<string> {
  if (seesAll) return new Set();
  const hidden = new Set<string>();
  const granted = new Set<string>();
  for (const b of boards) {
    if (!b.restricted) continue;
    const target = b.memberIds.has(userId) ? granted : hidden;
    for (const m of b.moduleIds) target.add(m);
  }
  for (const m of granted) hidden.delete(m);
  return hidden;
}

export function canSeeModule(moduleId: string | null, locked: ReadonlySet<string>): boolean {
  return !moduleId || !locked.has(moduleId);
}

/** Show the built-in role names in the UI language; renamed or custom roles are shown as typed. */
export function roleLabel(name: string, locale: string): string {
  if (locale !== "nb") return name;
  return DEFAULT_ROLES.find((r) => r.name === name)?.nameNb ?? name;
}
