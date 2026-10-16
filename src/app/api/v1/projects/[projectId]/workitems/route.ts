import type { Prisma } from "@/generated/prisma/client";
import { apiHandler, json, readJson, ApiError } from "@/server/api/http";
import { apiInputSchema, listQuerySchema, loadApiItem, projectByRef, toApiItem, toPatch } from "@/server/api/workitems";
import { createWorkItem } from "@/server/workitems";
import { loadItems } from "@/server/projects";
import { buildModuleSubtree } from "@/lib/query";
import { makeResolver } from "@/lib/resolve";

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler("read", async (req, user, { params }: Ctx) => {
  const meta = await projectByRef((await params).projectId);
  const q = listQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const r = makeResolver(meta);
  const ok = <T>(res: { ok: true; value: T } | { ok: false; error: string }) => {
    if (!res.ok) throw new ApiError(422, "INVALID_FILTER", res.error);
    return res.value;
  };
  const where: Prisma.WorkItemWhereInput = {};
  if (q.type) where.typeId = ok(r.type(q.type)).id;
  if (q.state) where.state = q.state;
  if (q.assignedTo) where.assignedToId = q.assignedTo === "me" ? user.id : q.assignedTo === "none" ? null : ok(r.user(q.assignedTo));
  if (q.module) {
    const id = ok(r.module(q.module));
    where.moduleId = { in: [...(buildModuleSubtree(meta.modules).get(id!) ?? [id!])] };
  }
  if (q.phase) where.phaseId = ok(r.phase(q.phase));
  if (q.changedSince) {
    const d = new Date(q.changedSince);
    if (Number.isNaN(d.getTime())) throw new ApiError(422, "INVALID_FILTER", "changedSince must be an ISO date/time");
    where.changedAt = { gte: d };
  }
  if (q.q) where.OR = [{ title: { contains: q.q } }, { descriptionText: { contains: q.q } }];
  const all = await loadItems(meta, where);
  const page = all.sort((a, b) => a.id - b.id).slice(q.offset, q.offset + q.limit);
  return json({ items: page.map((i) => toApiItem(i, meta)), total: all.length, limit: q.limit, offset: q.offset });
});

export const POST = apiHandler("write", async (req, user, { params }: Ctx) => {
  const meta = await projectByRef((await params).projectId);
  const input = apiInputSchema.parse(await readJson(req));
  if (!input.type) throw new ApiError(422, "INVALID_VALUE", "type is required");
  if (!input.title) throw new ApiError(422, "INVALID_VALUE", "title is required");
  const { typeId, ...patch } = toPatch(input, meta);
  const id = await createWorkItem({ ...patch, projectId: meta.id, typeId: typeId!, title: input.title }, user);
  const { item } = await loadApiItem(id);
  return json(item, 201, { Location: `/api/v1/workitems/${id}` });
});
