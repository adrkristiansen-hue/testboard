import "server-only";
import { z } from "zod";
import { db } from "./db";
import { ForbiddenError, type CurrentUser } from "./auth";
import { accessFor, canSeeItem, requirePermission } from "./access";
import { missingPermissions, requiredPermissions } from "@/lib/permissions";
import { loadProjectMeta } from "./projects";
import { categoryOf, checkTransition, initialState } from "@/lib/workflow";
import { normalizeTags, outcomeForTestState, parseJsonObject, parseStringArray } from "@/lib/fields";
import { docToText, sanitizeDoc, type RtDoc } from "@/lib/richtext";
import type { TypeLite } from "@/lib/types";
import { notifyItemChange } from "./notify";

import { UserError } from "./workitems-errors";
export { UserError };

const docSchema = z.custom<RtDoc>((v) => !!v && typeof v === "object" && (v as RtDoc).type === "doc", "Invalid rich text");

export const itemPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: docSchema.nullable(),
    state: z.string().min(1),
    assignedToId: z.string().nullable(),
    moduleId: z.string().nullable(),
    phaseId: z.string().nullable(),
    priority: z.number().int().min(1).max(4),
    severity: z.number().int().min(1).max(4).nullable(),
    tags: z.array(z.string().max(50)).max(30),
    dueDate: z.string().nullable(),
    fields: z.record(z.string(), z.unknown()),
    parentId: z.number().int().positive().nullable(),
    columnDone: z.boolean(),
    boardOrder: z.number(),
  })
  .partial();

export type ItemPatch = z.infer<typeof itemPatchSchema>;

export const createItemSchema = itemPatchSchema.extend({
  projectId: z.string(),
  typeId: z.string(),
  title: z.string().trim().min(1).max(255),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new UserError("Invalid date.");
  return d;
}

async function nextRev(workItemId: number): Promise<number> {
  const last = await db.historyEntry.findFirst({ where: { workItemId }, orderBy: { rev: "desc" }, select: { rev: true } });
  return (last?.rev ?? 0) + 1;
}

async function assertRefs(projectId: string, patch: ItemPatch) {
  if (patch.moduleId) {
    const m = await db.module.findFirst({ where: { id: patch.moduleId, projectId } });
    if (!m) throw new UserError("Unknown module.");
  }
  if (patch.phaseId) {
    const p = await db.phase.findFirst({ where: { id: patch.phaseId, projectId } });
    if (!p) throw new UserError("Unknown phase.");
  }
  if (patch.assignedToId) {
    const u = await db.user.findFirst({ where: { id: patch.assignedToId, active: true, memberships: { some: { projectId } } } });
    if (!u) throw new UserError("That user is not a member of this project.");
  }
}

async function assertNoCycle(itemId: number, parentId: number) {
  if (parentId === itemId) throw new UserError("An item cannot be its own parent.");
  let cur: number | null = parentId;
  let guard = 0;
  while (cur && guard++ < 100) {
    if (cur === itemId) throw new UserError("That parent would create a cycle.");
    const row: { parentId: number | null } | null = await db.workItem.findUnique({ where: { id: cur }, select: { parentId: true } });
    cur = row?.parentId ?? null;
  }
}

function typeFor(types: TypeLite[], typeId: string): TypeLite {
  const t = types.find((x) => x.id === typeId);
  if (!t) throw new UserError("Unknown work item type.");
  return t;
}

export interface WriteOptions {
  /** Bulk operations send one summary "assigned" notification instead of one per item. */
  suppressAssignedNotification?: boolean;
}

export async function createWorkItem(rawInput: CreateItemInput, user: CurrentUser, opts: WriteOptions = {}): Promise<number> {
  const input = createItemSchema.parse(rawInput);
  const meta = await loadProjectMeta(input.projectId);
  if (!meta) throw new UserError("Unknown project.");
  const type = typeFor(meta.types, input.typeId);
  if (type.disabled) throw new UserError("This work item type is disabled.");
  const access = await requirePermission(user, meta.id, "items.create");
  if (input.moduleId && access.lockedModules.has(input.moduleId)) throw new ForbiddenError("You cannot create work items in that module.");
  if (input.assignedToId && input.assignedToId !== user.id && !access.permissions.has("items.assign")) throw new ForbiddenError("Your role does not allow assigning work items to others.");
  await assertRefs(meta.id, input);

  const wf = { states: type.states, transitions: type.transitions };
  const state = input.state && type.states.some((s) => s.name === input.state) ? input.state : initialState(wf);
  const fields = { ...(input.fields ?? {}) };
  if (type.key === "TEST_TASK" && !fields.outcome) fields.outcome = outcomeForTestState(state) ?? "Not run";

  if (input.parentId) {
    const parent = await db.workItem.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.projectId !== meta.id) throw new UserError("Parent work item not found.");
  }

  // New cards go to the top of their column.
  const top = await db.workItem.findFirst({ where: { projectId: meta.id, state }, orderBy: { boardOrder: "asc" }, select: { boardOrder: true } });
  const description = input.description ? sanitizeDoc(input.description) : null;

  const created = await db.workItem.create({
    data: {
      projectId: meta.id,
      typeId: type.id,
      title: input.title,
      description: description ? JSON.stringify(description) : null,
      descriptionText: description ? docToText(description) : null,
      state,
      assignedToId: input.assignedToId ?? null,
      moduleId: input.moduleId ?? null,
      phaseId: input.phaseId ?? null,
      parentId: input.parentId ?? null,
      priority: input.priority ?? 2,
      severity: type.key === "DEFECT" ? (input.severity ?? 3) : (input.severity ?? null),
      tags: JSON.stringify(normalizeTags(input.tags ?? [])),
      dueDate: parseDate(input.dueDate),
      fields: JSON.stringify(fields),
      boardOrder: input.boardOrder ?? (top ? top.boardOrder - 1024 : 0),
      createdById: user.id,
      changedById: user.id,
    },
  });
  await db.historyEntry.create({
    data: { workItemId: created.id, rev: 1, field: "__created", oldValue: null, newValue: state, changedById: user.id },
  });
  await db.follow.upsert({
    where: { userId_workItemId: { userId: user.id, workItemId: created.id } },
    create: { userId: user.id, workItemId: created.id },
    update: {},
  });
  await notifyItemChange({ itemId: created.id, actor: user, created: true, changes: [{ field: "assignedToId", oldValue: null, newValue: created.assignedToId }], ...opts });
  return created.id;
}

export interface FieldChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}

/**
 * Apply a partial update, validating the workflow and recording field-level history.
 * Returns the list of changed fields (empty if nothing changed).
 */
export async function updateWorkItem(id: number, rawPatch: ItemPatch, user: CurrentUser, opts: WriteOptions = {}): Promise<FieldChange[]> {
  const patch = itemPatchSchema.parse(rawPatch);
  const item = await db.workItem.findUnique({ where: { id } });
  if (!item) throw new UserError("Work item not found.", "NOT_FOUND");
  const access = await accessFor(user, item.projectId);
  if (!canSeeItem(access, item)) throw new UserError("Work item not found.", "NOT_FOUND");
  const meta = await loadProjectMeta(item.projectId);
  if (!meta) throw new UserError("Unknown project.");
  const type = typeFor(meta.types, item.typeId);
  await assertRefs(meta.id, patch);
  if (patch.moduleId && patch.moduleId !== item.moduleId && access.lockedModules.has(patch.moduleId)) throw new ForbiddenError("You cannot move work items to that module.");

  const data: Record<string, unknown> = {};
  const changes: FieldChange[] = [];
  const track = (field: string, oldV: unknown, newV: unknown, dbValue: unknown = newV) => {
    if (str(oldV) === str(newV)) return;
    changes.push({ field, oldValue: str(oldV), newValue: str(newV) });
    data[field] = dbValue;
  };

  if (patch.title !== undefined) track("title", item.title, patch.title);
  if (patch.description !== undefined) {
    const doc = patch.description ? sanitizeDoc(patch.description) : null;
    const json = doc ? JSON.stringify(doc) : null;
    if (json !== item.description) {
      const text = doc ? docToText(doc) : null;
      changes.push({ field: "description", oldValue: item.descriptionText, newValue: text });
      data.description = json;
      data.descriptionText = text;
    }
  }

  let newState = item.state;
  if (patch.state !== undefined && patch.state !== item.state) {
    const check = checkTransition({ states: type.states, transitions: type.transitions }, item.state, patch.state);
    if (!check.ok) {
      throw new UserError(
        check.reason === "UNKNOWN_STATE" ? `"${patch.state}" is not a state of ${type.name}.` : `${type.name}: ${item.state} → ${patch.state} is not allowed by the workflow.`,
        check.reason,
      );
    }
    newState = patch.state;
    track("state", item.state, patch.state);
    data.stateChangedAt = new Date();
    // Moving to a new state starts in the "Doing" half unless explicitly set.
    if (patch.columnDone === undefined && item.columnDone) track("columnDone", item.columnDone, false);
  }
  if (patch.columnDone !== undefined) track("columnDone", item.columnDone, patch.columnDone);
  if (patch.assignedToId !== undefined) track("assignedToId", item.assignedToId, patch.assignedToId);
  if (patch.moduleId !== undefined) track("moduleId", item.moduleId, patch.moduleId);
  if (patch.phaseId !== undefined) track("phaseId", item.phaseId, patch.phaseId);
  if (patch.priority !== undefined) track("priority", item.priority, patch.priority);
  if (patch.severity !== undefined) track("severity", item.severity, patch.severity);
  if (patch.tags !== undefined) {
    const tags = normalizeTags(patch.tags);
    const old = parseStringArray(item.tags);
    if (JSON.stringify(old) !== JSON.stringify(tags)) {
      changes.push({ field: "tags", oldValue: old.join(", ") || null, newValue: tags.join(", ") || null });
      data.tags = JSON.stringify(tags);
    }
  }
  if (patch.dueDate !== undefined) {
    const d = parseDate(patch.dueDate);
    track("dueDate", item.dueDate?.toISOString().slice(0, 10) ?? null, d?.toISOString().slice(0, 10) ?? null, d);
  }
  if (patch.parentId !== undefined) {
    if (patch.parentId !== null) {
      const parent = await db.workItem.findUnique({ where: { id: patch.parentId } });
      if (!parent || parent.projectId !== item.projectId) throw new UserError("Parent work item not found.");
      await assertNoCycle(item.id, patch.parentId);
    }
    track("parentId", item.parentId, patch.parentId);
  }

  // Custom fields are merged; each changed key gets its own history row.
  const oldFields = parseJsonObject(item.fields);
  const mergedFields = { ...oldFields, ...(patch.fields ?? {}) };
  if (type.key === "TEST_TASK" && newState !== item.state) {
    const outcome = outcomeForTestState(newState);
    if (outcome && patch.fields?.outcome === undefined) mergedFields.outcome = outcome;
  }
  let fieldsChanged = false;
  for (const key of new Set([...Object.keys(oldFields), ...Object.keys(mergedFields)])) {
    if (str(oldFields[key]) !== str(mergedFields[key])) {
      fieldsChanged = true;
      changes.push({ field: `fields.${key}`, oldValue: str(oldFields[key]), newValue: str(mergedFields[key]) });
    }
  }
  if (fieldsChanged) data.fields = JSON.stringify(mergedFields);

  // Board order is not a tracked field (it changes on every drag).
  if (patch.boardOrder !== undefined && patch.boardOrder !== item.boardOrder) data.boardOrder = patch.boardOrder;

  if (Object.keys(data).length === 0) return [];
  const isOrderOnly = changes.length === 0;
  // Check the role against what actually changes (e.g. closing needs "items.close", reassigning "items.assign").
  const missing = missingPermissions(
    access.permissions,
    requiredPermissions(isOrderOnly ? [{ field: "boardOrder" }] : changes, {
      isOwnItem: item.createdById === user.id,
      userId: user.id,
      newStateCategory: newState !== item.state ? categoryOf({ states: type.states }, newState) : undefined,
    }),
  );
  if (missing.length) throw new ForbiddenError(`Your role in this project does not allow this change (${missing.join(", ")}).`);
  if (!isOrderOnly) {
    data.changedById = user.id;
    data.changedAt = new Date();
  }
  await db.workItem.update({ where: { id }, data });
  if (!isOrderOnly) {
    const rev = await nextRev(id);
    await db.historyEntry.createMany({
      data: changes.map((c) => ({ workItemId: id, rev, field: c.field, oldValue: c.oldValue, newValue: c.newValue, changedById: user.id })),
    });
    await notifyItemChange({ itemId: id, actor: user, created: false, changes, ...opts });
  }
  return changes;
}

export async function deleteWorkItem(id: number) {
  await db.workItem.delete({ where: { id } });
}
