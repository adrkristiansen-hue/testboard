"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { requireAdmin, requireConfigurer } from "../auth";
import { run, type ActionResult } from "../result";
import { UserError } from "../workitems";
import { audit } from "../audit";
import { DEFAULT_COLUMNS, DEFAULT_TYPES, columnStateMap } from "@/lib/process";
import { DEFAULT_CARD_CONFIG, CARD_FIELDS } from "@/lib/cards";
import { STATE_CATEGORIES, validateWorkflow, type StateCategory } from "@/lib/workflow";
import { validateColumns } from "@/lib/board";
import { ROLES } from "@/lib/types";
import { loadProjectMeta } from "../projects";
import { createProjectFromTemplate, parseTemplateContent, templateFromProject } from "../template-build";

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, "Key: 2–10 letters/digits, starting with a letter"),
  description: z.string().max(1000).optional(),
});

/** Create a project with the default process (types, workflows) and one team board. */
export async function createProject(input: z.infer<typeof projectSchema> & { templateId?: string }): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await requireConfigurer();
    const { templateId, ...rest } = input;
    const data = projectSchema.parse(rest);
    if (await db.project.findUnique({ where: { key: data.key } })) throw new UserError("That key is already in use.");
    if (templateId) {
      const tpl = await db.processTemplate.findUnique({ where: { id: templateId } });
      if (!tpl) throw new UserError("Template not found.");
      const id = await createProjectFromTemplate(db, data, parseTemplateContent(tpl.content), user.id);
      await audit(user.id, "project.create", "Project", id, { ...data, template: tpl.name });
      return { id };
    }
    const project = await db.project.create({ data });
    const typeIds = new Map<string, string>();
    for (const [i, t] of DEFAULT_TYPES.entries()) {
      const row = await db.workItemType.create({
        data: {
          projectId: project.id,
          key: t.key,
          name: t.name,
          icon: t.icon,
          color: t.color,
          order: i,
          fields: JSON.stringify(t.fields),
          transitions: JSON.stringify(t.workflow.transitions ?? {}),
          states: { create: t.workflow.states.map((s, j) => ({ name: s.name, category: s.category, color: s.color ?? "#94a3b8", order: s.order ?? j })) },
        },
      });
      typeIds.set(t.key, row.id);
    }
    await db.team.create({
      data: {
        projectId: project.id,
        name: `${data.name} team`,
        cardConfig: JSON.stringify(DEFAULT_CARD_CONFIG),
        members: { create: [{ userId: user.id }] },
        columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ name: c.name, order: i, wipLimit: c.wipLimit, split: c.split, stateMap: JSON.stringify(columnStateMap(c, typeIds)) })) },
      },
    });
    await audit(user.id, "project.create", "Project", project.id, data);
    return { id: project.id };
  });
}

export async function updateProject(id: string, input: { name: string; description?: string }): Promise<ActionResult> {
  return run(async () => {
    const user = await requireConfigurer();
    const data = projectSchema.pick({ name: true, description: true }).parse(input);
    await db.project.update({ where: { id }, data });
    await audit(user.id, "project.update", "Project", id, data);
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Modules (area paths)
// ---------------------------------------------------------------------------

export async function saveModule(projectId: string, input: { id?: string; name: string; parentId: string | null }): Promise<ActionResult> {
  return run(async () => {
    const user = await requireConfigurer();
    const name = z.string().trim().min(1).max(100).parse(input.name);
    if (input.parentId) {
      const parent = await db.module.findFirst({ where: { id: input.parentId, projectId } });
      if (!parent) throw new UserError("Parent module not found.");
      // Prevent cycles when re-parenting
      let cur: string | null = parent.id;
      while (cur) {
        if (cur === input.id) throw new UserError("A module cannot be moved under itself.");
        cur = (await db.module.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
      }
    }
    if (input.id) {
      await db.module.update({ where: { id: input.id }, data: { name, parentId: input.parentId } });
    } else {
      const max = await db.module.aggregate({ where: { projectId, parentId: input.parentId }, _max: { order: true } });
      await db.module.create({ data: { projectId, name, parentId: input.parentId, order: (max._max.order ?? -1) + 1 } });
    }
    await audit(user.id, input.id ? "module.update" : "module.create", "Module", input.id, { name, parentId: input.parentId });
    return undefined;
  });
}

export async function moveModule(id: string, direction: -1 | 1): Promise<ActionResult> {
  return run(async () => {
    await requireConfigurer();
    const m = await db.module.findUnique({ where: { id } });
    if (!m) throw new UserError("Module not found.");
    const siblings = await db.module.findMany({ where: { projectId: m.projectId, parentId: m.parentId }, orderBy: [{ order: "asc" }, { name: "asc" }] });
    const i = siblings.findIndex((s) => s.id === id);
    const j = i + direction;
    if (j < 0 || j >= siblings.length) return undefined;
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    for (const [k, s] of siblings.entries()) await db.module.update({ where: { id: s.id }, data: { order: k } });
    return undefined;
  });
}

export async function deleteModule(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireConfigurer();
    const inUse = await db.workItem.count({ where: { moduleId: id } });
    const children = await db.module.count({ where: { parentId: id } });
    if (children) throw new UserError("Delete or move the sub-modules first.");
    if (inUse) throw new UserError(`${inUse} work item(s) use this module. Move them first.`);
    await db.module.delete({ where: { id } });
    await audit(user.id, "module.delete", "Module", id);
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Phases (iterations)
// ---------------------------------------------------------------------------

const phaseSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});

export async function savePhase(projectId: string, input: z.infer<typeof phaseSchema>): Promise<ActionResult> {
  return run(async () => {
    const user = await requireConfigurer();
    const p = phaseSchema.parse(input);
    const start = p.startDate ? new Date(p.startDate) : null;
    const end = p.endDate ? new Date(p.endDate) : null;
    if (start && end && end < start) throw new UserError("End date must be after start date.");
    if (p.id) await db.phase.update({ where: { id: p.id }, data: { name: p.name, startDate: start, endDate: end } });
    else {
      const max = await db.phase.aggregate({ where: { projectId }, _max: { order: true } });
      await db.phase.create({ data: { projectId, name: p.name, startDate: start, endDate: end, order: (max._max.order ?? -1) + 1 } });
    }
    await audit(user.id, p.id ? "phase.update" : "phase.create", "Phase", p.id, p);
    return undefined;
  });
}

export async function deletePhase(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireConfigurer();
    const inUse = await db.workItem.count({ where: { phaseId: id } });
    if (inUse) throw new UserError(`${inUse} work item(s) use this phase. Move them first.`);
    await db.phase.delete({ where: { id } });
    await audit(user.id, "phase.delete", "Phase", id);
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

const teamSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(z.string()),
  modules: z.array(z.object({ moduleId: z.string(), includeChildren: z.boolean() })),
  /** New boards only: copy columns, swimlanes and card settings from this board */
  copyFromTeamId: z.string().optional(),
});

export async function saveTeam(projectId: string, input: z.infer<typeof teamSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await requireConfigurer();
    const t = teamSchema.parse(input);
    let id = t.id;
    if (id) {
      await db.team.update({ where: { id }, data: { name: t.name } });
      await db.teamMember.deleteMany({ where: { teamId: id } });
      await db.teamModule.deleteMany({ where: { teamId: id } });
    } else {
      const meta = await loadProjectMeta(projectId);
      if (!meta) throw new UserError("Unknown project.");
      const typeIds = new Map(meta.types.map((x) => [x.key, x.id]));
      const source = t.copyFromTeamId ? await db.team.findFirst({ where: { id: t.copyFromTeamId, projectId }, include: { columns: true } }) : null;
      if (t.copyFromTeamId && !source) throw new UserError("The board to copy from was not found.");
      const team = source
        ? await db.team.create({
            data: {
              projectId,
              name: t.name,
              swimlanes: source.swimlanes,
              cardConfig: source.cardConfig,
              columns: { create: source.columns.map((c) => ({ name: c.name, order: c.order, wipLimit: c.wipLimit, split: c.split, stateMap: c.stateMap })) },
            },
          })
        : await db.team.create({
        data: {
          projectId,
          name: t.name,
          cardConfig: JSON.stringify(DEFAULT_CARD_CONFIG),
          columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ name: c.name, order: i, wipLimit: c.wipLimit, split: c.split, stateMap: JSON.stringify(columnStateMap(c, typeIds)) })) },
        },
      });
      id = team.id;
    }
    if (t.memberIds.length) await db.teamMember.createMany({ data: t.memberIds.map((userId) => ({ teamId: id!, userId })) });
    if (t.modules.length) await db.teamModule.createMany({ data: t.modules.map((m) => ({ teamId: id!, moduleId: m.moduleId, includeChildren: m.includeChildren })) });
    await audit(user.id, t.id ? "team.update" : "team.create", "Team", id, t);
    return { id: id! };
  });
}

export async function deleteTeam(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireConfigurer();
    await db.team.delete({ where: { id } });
    await audit(user.id, "team.delete", "Team", id);
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Work item types, workflows and fields
// ---------------------------------------------------------------------------

const fieldDefSchema = z.object({
  key: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/, "Field key: letters, digits, underscore"),
  label: z.string().trim().min(1).max(80),
  labelNb: z.string().trim().max(80).optional(),
  kind: z.enum(["text", "richtext", "select", "number", "date", "steps"]),
  options: z.array(z.string().trim().min(1)).optional(),
});

const typeSchema = z.object({
  id: z.string().optional(),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,30}$/),
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(3),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  disabled: z.boolean(),
  states: z.array(z.object({ name: z.string().trim().min(1).max(40), category: z.enum(STATE_CATEGORIES), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(1),
  transitions: z.record(z.string(), z.array(z.string())),
  fields: z.array(fieldDefSchema),
  /** old state name -> new state name, to migrate items when states are renamed */
  renames: z.record(z.string(), z.string()).optional(),
});

export async function saveType(projectId: string, input: z.infer<typeof typeSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await requireConfigurer();
    const t = typeSchema.parse(input);
    const problems = validateWorkflow({ states: t.states.map((s, i) => ({ ...s, category: s.category as StateCategory, order: i })), transitions: t.transitions });
    const keys = new Set<string>();
    for (const f of t.fields) {
      if (keys.has(f.key)) problems.push(`Duplicate field key "${f.key}".`);
      keys.add(f.key);
    }
    if (problems.length) throw new UserError(problems.join(" "));
    const transitions = Object.fromEntries(Object.entries(t.transitions).filter(([, v]) => v.length > 0));
    let id = t.id;
    if (id) {
      const existing = await db.workItemType.findUnique({ where: { id }, include: { states: true } });
      if (!existing) throw new UserError("Type not found.");
      // Apply renames to work items and board columns before replacing states.
      for (const [from, to] of Object.entries(t.renames ?? {})) {
        if (from === to) continue;
        await db.workItem.updateMany({ where: { typeId: id, state: from }, data: { state: to } });
      }
      const newNames = new Set(t.states.map((s) => s.name));
      const orphaned = await db.workItem.count({ where: { typeId: id, state: { notIn: [...newNames] } } });
      if (orphaned) throw new UserError(`${orphaned} work item(s) are in a state you removed. Move them first or rename the state instead.`);
      await db.workItemType.update({
        where: { id },
        data: { name: t.name, icon: t.icon, color: t.color, disabled: t.disabled, fields: JSON.stringify(t.fields), transitions: JSON.stringify(transitions) },
      });
      await db.workflowState.deleteMany({ where: { typeId: id } });
      await db.workflowState.createMany({ data: t.states.map((s, i) => ({ typeId: id!, name: s.name, category: s.category, color: s.color, order: i })) });
      // Update board column mappings for renamed/removed states.
      if (t.renames && Object.keys(t.renames).length) {
        const cols = await db.boardColumn.findMany({ where: { team: { projectId } } });
        for (const c of cols) {
          const map = JSON.parse(c.stateMap) as Record<string, string[]>;
          if (!map[id]) continue;
          map[id] = map[id].map((s) => t.renames![s] ?? s).filter((s) => newNames.has(s));
          await db.boardColumn.update({ where: { id: c.id }, data: { stateMap: JSON.stringify(map) } });
        }
      }
    } else {
      if (await db.workItemType.findFirst({ where: { projectId, key: t.key } })) throw new UserError("A type with that key exists.");
      const max = await db.workItemType.aggregate({ where: { projectId }, _max: { order: true } });
      const row = await db.workItemType.create({
        data: {
          projectId,
          key: t.key,
          name: t.name,
          icon: t.icon,
          color: t.color,
          disabled: t.disabled,
          order: (max._max.order ?? -1) + 1,
          fields: JSON.stringify(t.fields),
          transitions: JSON.stringify(transitions),
          states: { create: t.states.map((s, i) => ({ name: s.name, category: s.category, color: s.color, order: i })) },
        },
      });
      id = row.id;
    }
    await audit(user.id, t.id ? "type.update" : "type.create", "WorkItemType", id, { name: t.name, states: t.states.map((s) => s.name) });
    return { id: id! };
  });
}

// ---------------------------------------------------------------------------
// Board configuration
// ---------------------------------------------------------------------------

const columnsSchema = z.array(
  z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(50),
    wipLimit: z.number().int().min(0).max(999).nullable(),
    split: z.boolean(),
    stateMap: z.record(z.string(), z.array(z.string())),
  }),
);

export async function saveColumns(teamId: string, input: z.infer<typeof columnsSchema>): Promise<ActionResult<{ warnings: string[] }>> {
  return run(async () => {
    const user = await requireConfigurer();
    const cols = columnsSchema.parse(input);
    const team = await db.team.findUnique({ where: { id: teamId } });
    if (!team) throw new UserError("Team not found.");
    const meta = await loadProjectMeta(team.projectId);
    const problems = validateColumns(
      cols.map((c, i) => ({ id: c.id ?? `new${i}`, name: c.name, order: i, wipLimit: c.wipLimit, split: c.split, stateMap: c.stateMap })),
      meta?.types ?? [],
    );
    const blocking = problems.filter((p) => p.includes("several columns") || p.includes("unknown state") || p.includes("at least one column"));
    if (blocking.length) throw new UserError(blocking.join(" "));
    const keep = cols.map((c) => c.id).filter((x): x is string => !!x);
    await db.boardColumn.deleteMany({ where: { teamId, id: { notIn: keep } } });
    for (const [i, c] of cols.entries()) {
      const data = { name: c.name, order: i, wipLimit: c.wipLimit || null, split: c.split, stateMap: JSON.stringify(c.stateMap) };
      if (c.id) await db.boardColumn.update({ where: { id: c.id }, data });
      else await db.boardColumn.create({ data: { ...data, teamId } });
    }
    await audit(user.id, "board.columns", "Team", teamId, cols.map((c) => c.name));
    return { warnings: problems.filter((p) => !blocking.includes(p)) };
  });
}

const conditionSchema: z.ZodType = z.lazy(() =>
  z.union([
    z.object({ field: z.string(), op: z.string(), value: z.unknown().optional() }),
    z.object({ logic: z.enum(["and", "or"]), clauses: z.array(conditionSchema) }),
  ]),
);

const swimlaneSchema = z.object({
  mode: z.enum(["none", "module", "assignee", "priority", "rules"]),
  defaultLaneName: z.string().max(50).optional(),
  rules: z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(50), color: z.string().optional(), when: z.object({ logic: z.enum(["and", "or"]), clauses: z.array(conditionSchema) }) })).optional(),
  collapsed: z.array(z.string()).optional(),
});

export async function saveSwimlanes(teamId: string, input: z.infer<typeof swimlaneSchema>): Promise<ActionResult> {
  return run(async () => {
    const user = await requireConfigurer();
    const cfg = swimlaneSchema.parse(input);
    await db.team.update({ where: { id: teamId }, data: { swimlanes: JSON.stringify(cfg) } });
    await audit(user.id, "board.swimlanes", "Team", teamId, cfg.mode);
    return undefined;
  });
}

const cardConfigSchema = z.object({
  fields: z.array(z.enum(CARD_FIELDS)),
  rules: z.array(
    z.object({
      id: z.string(),
      name: z.string().trim().min(1).max(50),
      style: z.enum(["border", "background"]),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      enabled: z.boolean(),
      when: z.object({ logic: z.enum(["and", "or"]), clauses: z.array(conditionSchema) }),
    }),
  ),
});

export async function saveCardConfig(teamId: string, input: z.infer<typeof cardConfigSchema>): Promise<ActionResult> {
  return run(async () => {
    const user = await requireConfigurer();
    const cfg = cardConfigSchema.parse(input);
    await db.team.update({ where: { id: teamId }, data: { cardConfig: JSON.stringify(cfg) } });
    await audit(user.id, "board.cards", "Team", teamId);
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------

const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES as [string, ...string[]]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean(),
  password: z.string().min(8).max(200).optional().or(z.literal("")),
});

export async function saveUser(input: z.infer<typeof userSchema>): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdmin();
    const u = userSchema.parse(input);
    const clash = await db.user.findUnique({ where: { email: u.email } });
    if (clash && clash.id !== u.id) throw new UserError("Email already in use.");
    if (u.id === admin.id && (u.role !== "ADMIN" || !u.active)) throw new UserError("You cannot remove your own admin access.");
    const base = { name: u.name, email: u.email, role: u.role, color: u.color, active: u.active };
    if (u.id) {
      await db.user.update({ where: { id: u.id }, data: { ...base, ...(u.password ? { passwordHash: bcrypt.hashSync(u.password, 10) } : {}) } });
    } else {
      if (!u.password) throw new UserError("A password is required for new users (min 8 characters).");
      await db.user.create({ data: { ...base, passwordHash: bcrypt.hashSync(u.password, 10) } });
    }
    await audit(admin.id, u.id ? "user.update" : "user.create", "User", u.id, { ...base, passwordChanged: !!u.password });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Process templates
// ---------------------------------------------------------------------------

export async function saveProjectAsTemplate(projectId: string, input: { name: string; description?: string }): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await requireConfigurer();
    const d = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(1000).optional() }).parse(input);
    const content = await templateFromProject(db, projectId);
    const row = await db.processTemplate.create({ data: { name: d.name, description: d.description || null, content: JSON.stringify(content) } });
    await audit(user.id, "template.create", "ProcessTemplate", row.id, { name: d.name, fromProject: projectId });
    return { id: row.id };
  });
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAdmin();
    const row = await db.processTemplate.findUnique({ where: { id } });
    if (!row) throw new UserError("Template not found.");
    await db.processTemplate.delete({ where: { id } });
    await audit(user.id, "template.delete", "ProcessTemplate", id, { name: row.name });
    return undefined;
  });
}
