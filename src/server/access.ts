import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { ForbiddenError, type CurrentUser } from "./auth";
import { UserError } from "./workitems-errors";
import { buildModuleSubtree } from "@/lib/query";
import { DEFAULT_ROLES, effectivePermissions, hasPermission, lockedModulesFor, parsePermissions, type BoardLock, type Permission } from "@/lib/permissions";
import type { ClientAccess, Role } from "@/lib/types";

export interface ProjectAccess {
  projectId: string;
  userId: string;
  isAdmin: boolean;
  member: boolean;
  roleId: string | null;
  roleName: string | null;
  permissions: Set<Permission>;
  /** Modules on locked boards the user is not a member of */
  lockedModules: Set<string>;
  /** Locked boards the user may not open */
  hiddenBoards: Set<string>;
}

const ROLE_FOR_GLOBAL: Record<Role, (typeof DEFAULT_ROLES)[number]["key"]> = { ADMIN: "LEAD", TEST_LEAD: "LEAD", MEMBER: "CONSULTANT", READ_ONLY: "READER" };

/** Create the default roles for a project. Returns role id by template key. */
export async function createDefaultRoles(projectId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [i, r] of DEFAULT_ROLES.entries()) {
    const row = await db.projectRole.upsert({
      where: { projectId_name: { projectId, name: r.name } },
      create: { projectId, name: r.name, permissions: JSON.stringify(r.permissions), order: i },
      update: {},
    });
    ids.set(r.key, row.id);
  }
  return ids;
}

/**
 * Projects created before access control have no roles or members. Give them the default roles and make
 * every active user a member (mapped from their old global role), so nobody loses access on upgrade.
 */
export const ensureProjectDefaults = cache(async (projectId: string) => {
  const roleCount = await db.projectRole.count({ where: { projectId } });
  if (roleCount > 0) return;
  const ids = await createDefaultRoles(projectId);
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, role: true } });
  for (const u of users) {
    const roleId = ids.get(ROLE_FOR_GLOBAL[u.role as Role] ?? "CONSULTANT")!;
    await db.projectMember.upsert({ where: { projectId_userId: { projectId, userId: u.id } }, create: { projectId, userId: u.id, roleId }, update: {} });
  }
});

async function boardLocks(projectId: string): Promise<BoardLock[]> {
  const teams = await db.team.findMany({ where: { projectId, restricted: true }, include: { modules: true, members: { select: { userId: true } } } });
  if (teams.length === 0) return [];
  const modules = await db.module.findMany({ where: { projectId }, select: { id: true, parentId: true } });
  const subtree = buildModuleSubtree(modules);
  return teams.map((t) => {
    const ids = new Set<string>();
    for (const m of t.modules) for (const id of m.includeChildren ? (subtree.get(m.moduleId) ?? [m.moduleId]) : [m.moduleId]) ids.add(id);
    return { teamId: t.id, restricted: true, moduleIds: ids, memberIds: new Set(t.members.map((m) => m.userId)) };
  });
}

/** A user's role, permissions and hidden modules in one project. Memoised per request. */
export const getAccess = cache(async (userId: string, globalRole: Role, projectId: string): Promise<ProjectAccess> => {
  await ensureProjectDefaults(projectId);
  const isAdmin = globalRole === "ADMIN";
  const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, include: { role: true } });
  const permissions = effectivePermissions(globalRole, membership ? parsePermissions(membership.role.permissions) : null);
  const seesAll = isAdmin || permissions.has("access.manage");
  const locks = await boardLocks(projectId);
  return {
    projectId,
    userId,
    isAdmin,
    member: !!membership,
    roleId: membership?.roleId ?? null,
    roleName: membership?.role.name ?? null,
    permissions,
    lockedModules: lockedModulesFor(userId, locks, seesAll),
    hiddenBoards: new Set(seesAll ? [] : locks.filter((l) => !l.memberIds.has(userId)).map((l) => l.teamId)),
  };
});

export function accessFor(user: CurrentUser, projectId: string) {
  return getAccess(user.id, user.role, projectId);
}

export function canView(a: ProjectAccess): boolean {
  return a.isAdmin || (a.member && a.permissions.has("items.view"));
}

export function can(a: ProjectAccess, p: Permission): boolean {
  return hasPermission(a.permissions, p);
}

/** Prisma filter that hides work items in locked modules. Items without a module stay visible. */
export function visibleItemsWhere(a: ProjectAccess): Prisma.WorkItemWhereInput {
  if (a.lockedModules.size === 0) return {};
  return { OR: [{ moduleId: null }, { moduleId: { notIn: [...a.lockedModules] } }] };
}

export function canSeeItem(a: ProjectAccess, item: { moduleId: string | null }): boolean {
  return canView(a) && (!item.moduleId || !a.lockedModules.has(item.moduleId));
}

export async function requireProjectAccess(user: CurrentUser, projectId: string): Promise<ProjectAccess> {
  const a = await accessFor(user, projectId);
  if (!canView(a)) throw new ForbiddenError("You do not have access to this project.");
  return a;
}

export async function requirePermission(user: CurrentUser, projectId: string, p: Permission): Promise<ProjectAccess> {
  const a = await requireProjectAccess(user, projectId);
  if (!can(a, p)) throw new ForbiddenError(`Your role in this project does not allow this (${p}).`);
  return a;
}

/** Load a work item the user may see; otherwise "not found" (never reveal that it exists). */
export async function requireVisibleItem(user: CurrentUser, itemId: number) {
  const item = await db.workItem.findUnique({ where: { id: itemId } });
  if (!item) throw new UserError("Work item not found.", "NOT_FOUND");
  const a = await accessFor(user, item.projectId);
  if (!canSeeItem(a, item)) throw new UserError("Work item not found.", "NOT_FOUND");
  return { item, access: a };
}

/** Projects the user can open: all for system admins, otherwise those they are a member of. */
export async function visibleProjectIds(user: CurrentUser): Promise<string[]> {
  if (user.role === "ADMIN") return (await db.project.findMany({ select: { id: true } })).map((p) => p.id);
  // Make sure pre-access-control projects get their default members first.
  for (const p of await db.project.findMany({ where: { roles: { none: {} } }, select: { id: true } })) await ensureProjectDefaults(p.id);
  return (await db.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } })).map((m) => m.projectId);
}

/** What the browser needs to show or hide actions. The server still checks every action. */
export function toClientAccess(a: ProjectAccess): ClientAccess {
  return { permissions: [...a.permissions], roleName: a.roleName, isAdmin: a.isAdmin };
}
