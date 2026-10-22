// Process templates: capture a project's process (modules, phases, types/workflows/fields, boards)
// and create new projects from it. Takes a Prisma client so the seed script can use it too.
import type { PrismaClient } from "../generated/prisma/client";

export interface TemplateContent {
  version: 1;
  modules: { path: string; name: string; parentPath: string | null; order: number }[];
  phases: { name: string; order: number; requireApprovedScripts?: boolean }[];
  types: { key: string; name: string; icon: string; color: string; disabled: boolean; order: number; fields: string; transitions: string; states: { name: string; category: string; color: string; order: number }[] }[];
  teams: {
    name: string;
    modules: { path: string; includeChildren: boolean }[];
    /** stateMap keyed by type key */
    columns: { name: string; order: number; wipLimit: number | null; split: boolean; stateMap: Record<string, string[]> }[];
    /** JSON with module ids replaced by "module:<path>" and type ids by "type:<key>" */
    swimlanes: string;
    cardConfig: string;
  }[];
}

/** Replace every occurrence of the given ids inside a JSON string. Ids are cuids, so plain replacement is safe. */
function remapIds(json: string, map: Map<string, string>): string {
  let out = json;
  for (const [from, to] of map) out = out.split(JSON.stringify(from)).join(JSON.stringify(to));
  return out;
}

export async function templateFromProject(client: PrismaClient, projectId: string): Promise<TemplateContent> {
  const p = await client.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      modules: true,
      phases: { orderBy: { order: "asc" } },
      types: { include: { states: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
      teams: { include: { modules: true, columns: { orderBy: { order: "asc" } } }, orderBy: { name: "asc" } },
    },
  });
  const byId = new Map(p.modules.map((m) => [m.id, m]));
  const pathOf = (id: string): string => {
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 50) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" > ");
  };
  // Parents before children so they can be created in order.
  const modules = p.modules
    .map((m) => ({ path: pathOf(m.id), name: m.name, parentPath: m.parentId ? pathOf(m.parentId) : null, order: m.order }))
    .sort((a, b) => a.path.split(" > ").length - b.path.split(" > ").length || a.order - b.order);
  const typeKey = new Map(p.types.map((t) => [t.id, t.key]));
  const symbolic = new Map<string, string>([...p.modules.map((m) => [m.id, `module:${pathOf(m.id)}`] as [string, string]), ...p.types.map((t) => [t.id, `type:${t.key}`] as [string, string])]);

  return {
    version: 1,
    modules,
    phases: p.phases.map((ph) => ({ name: ph.name, order: ph.order, requireApprovedScripts: ph.requireApprovedScripts })),
    types: p.types.map((t) => ({ key: t.key, name: t.name, icon: t.icon, color: t.color, disabled: t.disabled, order: t.order, fields: t.fields, transitions: t.transitions, states: t.states.map((s) => ({ name: s.name, category: s.category, color: s.color, order: s.order })) })),
    teams: p.teams.map((tm) => ({
      name: tm.name,
      modules: tm.modules.map((m) => ({ path: pathOf(m.moduleId), includeChildren: m.includeChildren })),
      columns: tm.columns.map((c) => {
        const raw = JSON.parse(c.stateMap || "{}") as Record<string, string[]>;
        return { name: c.name, order: c.order, wipLimit: c.wipLimit, split: c.split, stateMap: Object.fromEntries(Object.entries(raw).map(([tid, states]) => [typeKey.get(tid) ?? tid, states])) };
      }),
      swimlanes: remapIds(tm.swimlanes, symbolic),
      cardConfig: remapIds(tm.cardConfig, symbolic),
    })),
  };
}

export function summarizeTemplate(c: TemplateContent) {
  return { modules: c.modules.length, phases: c.phases.length, types: c.types.length, boards: c.teams.length };
}

export async function createProjectFromTemplate(client: PrismaClient, data: { name: string; key: string; description?: string }, c: TemplateContent, creatorId: string): Promise<string> {
  const project = await client.project.create({ data });
  const moduleIds = new Map<string, string>();
  for (const m of c.modules) {
    const row = await client.module.create({ data: { projectId: project.id, name: m.name, order: m.order, parentId: m.parentPath ? (moduleIds.get(m.parentPath) ?? null) : null } });
    moduleIds.set(m.path, row.id);
  }
  for (const ph of c.phases) await client.phase.create({ data: { projectId: project.id, name: ph.name, order: ph.order, requireApprovedScripts: !!ph.requireApprovedScripts } });
  const typeIds = new Map<string, string>();
  for (const t of c.types) {
    const row = await client.workItemType.create({
      data: { projectId: project.id, key: t.key, name: t.name, icon: t.icon, color: t.color, disabled: t.disabled, order: t.order, fields: t.fields, transitions: t.transitions, states: { create: t.states } },
    });
    typeIds.set(t.key, row.id);
  }
  const concrete = new Map<string, string>([...[...moduleIds].map(([path, id]) => [`module:${path}`, id] as [string, string]), ...[...typeIds].map(([key, id]) => [`type:${key}`, id] as [string, string])]);
  for (const [i, tm] of c.teams.entries()) {
    await client.team.create({
      data: {
        projectId: project.id,
        name: tm.name,
        swimlanes: remapIds(tm.swimlanes, concrete),
        cardConfig: remapIds(tm.cardConfig, concrete),
        // The creator joins the first board so the project opens on it.
        members: i === 0 ? { create: [{ userId: creatorId }] } : undefined,
        modules: { create: tm.modules.filter((m) => moduleIds.has(m.path)).map((m) => ({ moduleId: moduleIds.get(m.path)!, includeChildren: m.includeChildren })) },
        columns: {
          create: tm.columns.map((col) => ({
            name: col.name,
            order: col.order,
            wipLimit: col.wipLimit,
            split: col.split,
            stateMap: JSON.stringify(Object.fromEntries(Object.entries(col.stateMap).filter(([k]) => typeIds.has(k)).map(([k, v]) => [typeIds.get(k)!, v]))),
          })),
        },
      },
    });
  }
  return project.id;
}

export function parseTemplateContent(json: string): TemplateContent {
  const v = JSON.parse(json) as TemplateContent;
  if (v?.version !== 1 || !Array.isArray(v.types) || !Array.isArray(v.teams)) throw new Error("Unsupported template format.");
  return v;
}
