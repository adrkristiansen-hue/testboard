import "server-only";
import { z } from "zod";
import { db } from "../db";
import { loadVisibleItems, loadProjectMeta, scopeMeta } from "../projects";
import { accessFor, canView, type ProjectAccess } from "../access";
import type { CurrentUser } from "../auth";
import { ApiError } from "./http";
import { appUrl } from "../email";
import type { ItemPatch } from "../workitems";
import type { ItemView, ProjectMeta } from "@/lib/types";
import { makeResolver, parseDateValue } from "@/lib/resolve";
import { textToDoc } from "@/lib/richtext";
import { categoryOf } from "@/lib/workflow";

/** Project by id or key (case-insensitive) that the token's user is a member of. */
export async function projectByRef(ref: string, user: CurrentUser): Promise<{ meta: ProjectMeta; access: ProjectAccess }> {
  const p = await db.project.findFirst({ where: { OR: [{ id: ref }, { key: ref.toUpperCase() }] }, select: { id: true } });
  const meta = p ? await loadProjectMeta(p.id) : null;
  const access = meta ? await accessFor(user, meta.id) : null;
  if (!meta || !access || !canView(access)) throw new ApiError(404, "NOT_FOUND", `Project "${ref}" not found.`);
  return { meta: scopeMeta(meta, access), access };
}

export interface ApiWorkItem {
  id: number;
  project: string;
  type: string;
  title: string;
  state: string;
  stateCategory: string | null;
  assignedTo: { email: string; name: string } | null;
  module: string | null;
  phase: string | null;
  priority: number;
  severity: number | null;
  tags: string[];
  dueDate: string | null;
  parentId: number | null;
  description: string | null;
  fields: Record<string, unknown>;
  createdAt: string;
  changedAt: string;
  url: string;
}

export function toApiItem(i: ItemView, meta: ProjectMeta): ApiWorkItem {
  const type = meta.types.find((t) => t.id === i.typeId);
  const user = i.assignedToId ? meta.users.find((u) => u.id === i.assignedToId) : undefined;
  return {
    id: i.id,
    project: meta.key,
    type: type?.key ?? "",
    title: i.title,
    state: i.state,
    stateCategory: (type && categoryOf({ states: type.states }, i.state)) ?? null,
    assignedTo: user ? { email: user.email, name: user.name } : null,
    module: i.moduleId ? (meta.modules.find((m) => m.id === i.moduleId)?.path ?? null) : null,
    phase: i.phaseId ? (meta.phases.find((p) => p.id === i.phaseId)?.name ?? null) : null,
    priority: i.priority,
    severity: i.severity,
    tags: i.tags,
    dueDate: i.dueDate?.slice(0, 10) ?? null,
    parentId: i.parentId,
    description: i.descriptionText ?? null,
    fields: i.fields,
    createdAt: i.createdAt,
    changedAt: i.changedAt,
    url: `${appUrl().replace(/\/+$/, "")}/p/${meta.id}/items/${i.id}`,
  };
}

/** A work item the token's user may see (otherwise 404, never revealing that it exists). */
export async function loadApiItem(id: number, user: CurrentUser): Promise<{ item: ApiWorkItem; meta: ProjectMeta; access: ProjectAccess }> {
  const row = await db.workItem.findUnique({ where: { id }, select: { projectId: true } });
  const meta = row ? await loadProjectMeta(row.projectId) : null;
  const access = meta ? await accessFor(user, meta.id) : null;
  const [view] = meta && access && canView(access) ? await loadVisibleItems(access, meta, { id }) : [];
  if (!meta || !access || !view) throw new ApiError(404, "NOT_FOUND", `Work item #${id} not found.`);
  return { item: toApiItem(view, meta), meta, access };
}

/** Writable fields, in API terms (keys, e-mails, paths, names). */
export const apiInputSchema = z
  .object({
    type: z.string(),
    title: z.string().trim().min(1).max(255),
    state: z.string(),
    assignedTo: z.string().nullable(),
    module: z.string().nullable(),
    phase: z.string().nullable(),
    priority: z.number().int().min(1).max(4),
    severity: z.number().int().min(1).max(4).nullable(),
    tags: z.array(z.string().max(50)).max(30),
    dueDate: z.string().nullable(),
    parentId: z.number().int().positive().nullable(),
    description: z.string().max(100_000).nullable(),
    fields: z.record(z.string(), z.unknown()),
  })
  .partial()
  .strict();
export type ApiInput = z.infer<typeof apiInputSchema>;

function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new ApiError(422, "INVALID_VALUE", r.error);
  return r.value;
}

/** Translate API input to the internal patch, resolving names to ids. `typeKey` is needed to resolve states. */
export function toPatch(input: ApiInput, meta: ProjectMeta, currentTypeId?: string): ItemPatch & { typeId?: string } {
  const r = makeResolver(meta);
  const patch: ItemPatch & { typeId?: string } = {};
  const type = input.type !== undefined ? must(r.type(input.type)) : meta.types.find((t) => t.id === currentTypeId);
  if (input.type !== undefined) patch.typeId = type!.id;
  if (input.title !== undefined) patch.title = input.title;
  if (input.state !== undefined) {
    if (!type) throw new ApiError(422, "INVALID_VALUE", "type is required");
    patch.state = must(r.state(type, input.state));
  }
  if (input.assignedTo !== undefined) patch.assignedToId = input.assignedTo === null ? null : must(r.user(input.assignedTo));
  if (input.module !== undefined) patch.moduleId = input.module === null ? null : must(r.module(input.module));
  if (input.phase !== undefined) patch.phaseId = input.phase === null ? null : must(r.phase(input.phase));
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.severity !== undefined) patch.severity = input.severity;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate === null ? null : must(parseDateValue(input.dueDate));
  if (input.parentId !== undefined) patch.parentId = input.parentId;
  if (input.description !== undefined) patch.description = input.description ? textToDoc(input.description) : null;
  if (input.fields !== undefined) patch.fields = input.fields;
  return patch;
}

export const listQuerySchema = z.object({
  type: z.string().optional(),
  state: z.string().optional(),
  assignedTo: z.string().optional(),
  module: z.string().optional(),
  phase: z.string().optional(),
  changedSince: z.string().optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
