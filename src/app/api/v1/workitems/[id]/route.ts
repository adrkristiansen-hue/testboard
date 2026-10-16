import { apiHandler, json, readJson, ApiError } from "@/server/api/http";
import { apiInputSchema, loadApiItem, toPatch } from "@/server/api/workitems";
import { updateWorkItem } from "@/server/workitems";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

type Ctx = { params: Promise<{ id: string }> };

function idOf(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "INVALID", "Work item id must be a positive integer.");
  return id;
}

export const GET = apiHandler("read", async (_req, _user, { params }: Ctx) => json((await loadApiItem(idOf((await params).id))).item));

/** Partial update. Workflow rules apply exactly as in the UI. Changing the type is not supported. */
export const PATCH = apiHandler("write", async (req, user, { params }: Ctx) => {
  const id = idOf((await params).id);
  const { meta } = await loadApiItem(id);
  const input = apiInputSchema.parse(await readJson(req));
  if (input.type !== undefined) throw new ApiError(422, "INVALID_VALUE", "The type of an existing work item cannot be changed.");
  const current = await db.workItem.findUnique({ where: { id }, select: { typeId: true } });
  const changes = await updateWorkItem(id, toPatch(input, meta, current!.typeId), user);
  const { item } = await loadApiItem(id);
  return json({ ...item, changedFields: changes.map((c) => c.field) });
});

export const DELETE = apiHandler("configure", async (_req, user, { params }: Ctx) => {
  const id = idOf((await params).id);
  const { item } = await loadApiItem(id);
  await db.workItem.updateMany({ where: { parentId: id }, data: { parentId: null } });
  await db.workItem.delete({ where: { id } });
  await audit(user.id, "workitem.delete", "WorkItem", String(id), { title: item.title, via: "api" });
  return new Response(null, { status: 204 });
});
