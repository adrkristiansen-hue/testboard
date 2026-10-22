import { z } from "zod";
import { apiHandler, json, readJson, ApiError } from "@/server/api/http";
import { loadApiItem } from "@/server/api/workitems";
import { db } from "@/server/db";
import { notifyComment } from "@/server/notify";
import { can } from "@/server/access";
import { docToText, textToDoc } from "@/lib/richtext";

type Ctx = { params: Promise<{ id: string }> };

function idOf(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "INVALID", "Work item id must be a positive integer.");
  return id;
}

export const GET = apiHandler("read", async (_req, user, { params }: Ctx) => {
  const id = idOf((await params).id);
  const { access } = await loadApiItem(id, user);
  const rows = await db.comment.findMany({ where: { workItemId: id, ...(can(access, "comments.internal") ? {} : { internal: false }) }, include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  return json({ comments: rows.map((c) => ({ id: c.id, author: c.author, text: c.bodyText, internal: c.internal, createdAt: c.createdAt.toISOString(), editedAt: c.editedAt?.toISOString() ?? null })) });
});

export const POST = apiHandler("write", async (req, user, { params }: Ctx) => {
  const id = idOf((await params).id);
  const { access } = await loadApiItem(id, user);
  const { text, internal = false } = z.object({ text: z.string().trim().min(1).max(20_000), internal: z.boolean().optional() }).strict().parse(await readJson(req));
  if (!can(access, "comments.add")) throw new ApiError(403, "FORBIDDEN", "Your role in this project does not allow comments.");
  if (internal && !can(access, "comments.internal")) throw new ApiError(403, "FORBIDDEN", "Your role cannot write internal comments.");
  const doc = textToDoc(text);
  const c = await db.comment.create({ data: { workItemId: id, authorId: user.id, body: JSON.stringify(doc), bodyText: docToText(doc), internal } });
  await notifyComment({ itemId: id, actor: user, mentionedUserIds: [], mentionedTeamIds: [], internal });
  return json({ id: c.id, author: { name: user.name, email: user.email }, text: c.bodyText, internal, createdAt: c.createdAt.toISOString(), editedAt: null }, 201);
});
