import "server-only";
import { cache } from "react";
import { db } from "./db";
import type { ItemView, ModuleLite, ProjectMeta, Role, TypeLite } from "@/lib/types";
import { parseFieldDefs, parseJsonObject, parseStringArray } from "@/lib/fields";
import { isClosedCategory, type StateCategory } from "@/lib/workflow";
import { buildModuleSubtree } from "@/lib/query";
import { ensureProjectDefaults, visibleItemsWhere, type ProjectAccess } from "./access";
import type { Prisma } from "@/generated/prisma/client";

export function modulePaths<T extends { id: string; name: string; parentId: string | null; order: number }>(mods: T[]): (T & { path: string })[] {
  const byId = new Map(mods.map((m) => [m.id, m]));
  const pathOf = (m: T): string => {
    const parts: string[] = [m.name];
    let cur = m.parentId ? byId.get(m.parentId) : undefined;
    let guard = 0;
    while (cur && guard++ < 20) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" > ");
  };
  // Depth-first order so trees render naturally in selects.
  const children = new Map<string | null, T[]>();
  for (const m of mods) {
    const list = children.get(m.parentId) ?? [];
    list.push(m);
    children.set(m.parentId, list);
  }
  const out: (T & { path: string })[] = [];
  const visit = (parent: string | null) => {
    for (const m of (children.get(parent) ?? []).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
      out.push({ ...m, path: pathOf(m) });
      visit(m.id);
    }
  };
  visit(null);
  return out;
}

export const loadProjectMeta = cache(async (projectId: string): Promise<ProjectMeta | null> => {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      modules: true,
      phases: { orderBy: [{ order: "asc" }, { startDate: "asc" }] },
      types: { include: { states: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
      teams: { orderBy: { name: "asc" } },
    },
  });
  if (!project) return null;
  // People who can be assigned or mentioned: active members of this project only.
  await ensureProjectDefaults(projectId);
  const users = await db.user.findMany({ where: { active: true, memberships: { some: { projectId } } }, include: { organization: { select: { name: true } } }, orderBy: { name: "asc" } });
  const modules: ModuleLite[] = modulePaths(project.modules).map((m) => ({ id: m.id, name: m.name, parentId: m.parentId, order: m.order, path: m.path }));
  const types: TypeLite[] = project.types.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    icon: t.icon,
    color: t.color,
    disabled: t.disabled,
    fields: parseFieldDefs(t.fields),
    transitions: parseJsonObject(t.transitions) as Record<string, string[]>,
    states: t.states.map((s) => ({ name: s.name, category: s.category as StateCategory, color: s.color, order: s.order })),
  }));
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    modules,
    phases: project.phases.map((p) => ({ id: p.id, name: p.name, order: p.order, startDate: p.startDate?.toISOString() ?? null, endDate: p.endDate?.toISOString() ?? null })),
    types,
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, color: u.color, role: u.role as Role, organization: u.organization?.name ?? null })),
    teams: project.teams.map((t) => ({ id: t.id, name: t.name })),
  };
});

/** Prisma include used for every list/board load. */
export const itemViewInclude = {
  _count: { select: { comments: true, linksFrom: true, linksTo: true } },
  children: { select: { typeId: true, state: true } },
} satisfies Prisma.WorkItemInclude;

type ItemRow = Prisma.WorkItemGetPayload<{ include: typeof itemViewInclude }>;

export function toItemView(row: ItemRow, types: Map<string, TypeLite>): ItemView {
  let childDone = 0;
  for (const c of row.children) {
    const t = types.get(c.typeId);
    const cat = t?.states.find((s) => s.name === c.state)?.category;
    if (isClosedCategory(cat)) childDone++;
  }
  return {
    id: row.id,
    typeId: row.typeId,
    title: row.title,
    state: row.state,
    columnDone: row.columnDone,
    assignedToId: row.assignedToId,
    moduleId: row.moduleId,
    phaseId: row.phaseId,
    parentId: row.parentId,
    priority: row.priority,
    severity: row.severity,
    tags: parseStringArray(row.tags),
    dueDate: row.dueDate?.toISOString() ?? null,
    boardOrder: row.boardOrder,
    commentCount: row._count.comments,
    childTotal: row.children.length,
    childDone,
    linkCount: row._count.linksFrom + row._count.linksTo + (row.parentId ? 1 : 0) + row.children.length,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    changedAt: row.changedAt.toISOString(),
    stateChangedAt: row.stateChangedAt.toISOString(),
    fields: parseJsonObject(row.fields),
    descriptionText: row.descriptionText,
  };
}

export async function loadItems(meta: ProjectMeta, where: Prisma.WorkItemWhereInput = {}): Promise<ItemView[]> {
  const rows = await db.workItem.findMany({
    where: { projectId: meta.id, ...where },
    include: itemViewInclude,
    orderBy: [{ boardOrder: "asc" }, { id: "asc" }],
  });
  const types = new Map(meta.types.map((t) => [t.id, t]));
  return rows.map((r) => toItemView(r, types));
}

/** Work items the user may see (items in locked boards' modules are left out). */
export function loadVisibleItems(access: ProjectAccess, meta: ProjectMeta, where: Prisma.WorkItemWhereInput = {}): Promise<ItemView[]> {
  return loadItems(meta, { AND: [where, visibleItemsWhere(access)] });
}

/** Module ids visible on a team's board (subscribed modules, optionally with their sub-modules). */
export async function teamModuleIds(teamId: string, meta: ProjectMeta): Promise<Set<string>> {
  const subs = await db.teamModule.findMany({ where: { teamId } });
  const subtree = buildModuleSubtree(meta.modules);
  const ids = new Set<string>();
  for (const s of subs) {
    if (s.includeChildren) for (const id of subtree.get(s.moduleId) ?? [s.moduleId]) ids.add(id);
    else ids.add(s.moduleId);
  }
  return ids;
}

/** Project metadata as one user may see it: locked boards they are not on are left out. */
export function scopeMeta(meta: ProjectMeta, access: ProjectAccess): ProjectMeta {
  return access.hiddenBoards.size ? { ...meta, teams: meta.teams.filter((t) => !access.hiddenBoards.has(t.id)) } : meta;
}
