"use server";

import { z } from "zod";
import { db } from "../db";
import { getCurrentUser, requireEditor, requireConfigurer, ForbiddenError } from "../auth";
import { run, type ActionResult } from "../result";
import { createWorkItem, updateWorkItem, UserError, type CreateItemInput, type FieldChange, type ItemPatch } from "../workitems";
import { loadItemDetail } from "../items-detail";
import { loadProjectMeta } from "../projects";
import { notifyComment, follow } from "../notify";
import { getStorage } from "../storage";
import { parseStateMap, resolveMove, orderBetween } from "@/lib/board";
import { docToText, isDocEmpty, sanitizeDoc, collectImageSrcs, type RtDoc } from "@/lib/richtext";
import { extractMentions } from "@/lib/mentions";
import type { ItemDetail, LinkKind } from "@/lib/detail-types";

export async function getItemDetail(id: number): Promise<ActionResult<ItemDetail>> {
  return run(async () => {
    const user = await getCurrentUser();
    if (!user) throw new ForbiddenError("Not signed in.");
    const detail = await loadItemDetail(id, user.id);
    if (!detail) throw new UserError("Work item not found.", "NOT_FOUND");
    return detail;
  });
}

export async function createItem(input: CreateItemInput): Promise<ActionResult<{ id: number }>> {
  return run(async () => {
    const user = await requireEditor();
    const id = await createWorkItem(input, user);
    return { id };
  });
}

export async function updateItem(id: number, patch: ItemPatch): Promise<ActionResult<FieldChange[]>> {
  return run(async () => {
    const user = await requireEditor();
    return updateWorkItem(id, patch, user);
  });
}

export async function bulkUpdateItems(ids: number[], patch: ItemPatch): Promise<ActionResult<{ updated: number; errors: string[] }>> {
  return run(async () => {
    const user = await requireEditor();
    const errors: string[] = [];
    let updated = 0;
    for (const id of ids.slice(0, 1000)) {
      try {
        const changes = await updateWorkItem(id, patch, user);
        if (changes.length) updated++;
      } catch (e) {
        errors.push(`#${id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    return { updated, errors };
  });
}

export async function deleteItem(id: number): Promise<ActionResult> {
  return run(async () => {
    await requireConfigurer();
    const atts = await db.attachment.findMany({ where: { workItemId: id } });
    await db.workItem.updateMany({ where: { parentId: id }, data: { parentId: null } });
    await db.workItem.delete({ where: { id } });
    for (const a of atts) await getStorage().delete(a.storageKey).catch(() => undefined);
    return undefined;
  });
}

const moveSchema = z.object({
  id: z.number().int(),
  columnId: z.string(),
  done: z.boolean(),
  /** board orders of the neighbours at the drop position */
  before: z.number().optional(),
  after: z.number().optional(),
  lane: z
    .object({
      field: z.enum(["moduleId", "assignedToId", "priority"]),
      value: z.union([z.string(), z.number(), z.null()]),
    })
    .optional(),
});

/** Drag-and-drop or "Move to column": resolve the target state from the column mapping. */
export async function moveCard(input: z.infer<typeof moveSchema>): Promise<ActionResult<{ state: string }>> {
  return run(async () => {
    const user = await requireEditor();
    const m = moveSchema.parse(input);
    const item = await db.workItem.findUnique({ where: { id: m.id } });
    if (!item) throw new UserError("Work item not found.", "NOT_FOUND");
    const col = await db.boardColumn.findUnique({ where: { id: m.columnId } });
    if (!col) throw new UserError("Column not found.");
    const meta = await loadProjectMeta(item.projectId);
    const type = meta?.types.find((t) => t.id === item.typeId);
    if (!type) throw new UserError("Unknown type.");
    const res = resolveMove(item, { id: col.id, name: col.name, order: col.order, wipLimit: col.wipLimit, split: col.split, stateMap: parseStateMap(col.stateMap) }, type, m.done);
    if (!res.ok) throw new UserError(res.reason === "NO_MAPPING" ? "board.noMapping" : "board.transitionNotAllowed", res.reason);
    const patch: ItemPatch = { columnDone: res.columnDone };
    if (res.stateChanged) patch.state = res.state;
    if (m.before !== undefined || m.after !== undefined) patch.boardOrder = orderBetween(m.before, m.after);
    if (m.lane) {
      if (m.lane.field === "priority") patch.priority = typeof m.lane.value === "number" ? m.lane.value : 2;
      else patch[m.lane.field] = m.lane.value === null ? null : String(m.lane.value);
    }
    await updateWorkItem(m.id, patch, user);
    return { state: res.state };
  });
}

/** Search for #ID suggestions and the link picker. */
export async function searchItems(projectId: string, query: string): Promise<{ id: number; title: string; typeId: string }[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const q = query.trim().replace(/^#/, "");
  const asNum = Number(q);
  const rows = await db.workItem.findMany({
    where: {
      projectId,
      ...(q ? { OR: [...(Number.isInteger(asNum) && asNum > 0 ? [{ id: asNum }] : []), { title: { contains: q } }] } : {}),
    },
    select: { id: true, title: true, typeId: true },
    orderBy: { changedAt: "desc" },
    take: 8,
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

async function linkCommentImages(commentId: string, workItemId: number, doc: RtDoc) {
  const ids = collectImageSrcs(doc)
    .map((s) => /^\/api\/attachments\/([\w-]+)/.exec(s)?.[1])
    .filter((x): x is string => !!x);
  if (ids.length) await db.attachment.updateMany({ where: { id: { in: ids }, workItemId }, data: { commentId } });
}

async function saveMentions(commentId: string, doc: RtDoc) {
  const m = extractMentions(doc);
  await db.mention.deleteMany({ where: { commentId } });
  if (m.userIds.length || m.teamIds.length) {
    await db.mention.createMany({
      data: [...m.userIds.map((userId) => ({ commentId, userId })), ...m.teamIds.map((teamId) => ({ commentId, teamId }))],
    });
  }
  return m;
}

export async function addComment(workItemId: number, body: RtDoc): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await requireEditor();
    if (isDocEmpty(body)) throw new UserError("Comment is empty.");
    const doc = sanitizeDoc(body) as RtDoc;
    const c = await db.comment.create({ data: { workItemId, authorId: user.id, body: JSON.stringify(doc), bodyText: docToText(doc) } });
    await linkCommentImages(c.id, workItemId, doc);
    const m = await saveMentions(c.id, doc);
    // Validate mention targets exist before notifying
    const users = m.userIds.length ? (await db.user.findMany({ where: { id: { in: m.userIds } }, select: { id: true } })).map((u) => u.id) : [];
    const teams = m.teamIds.length ? (await db.team.findMany({ where: { id: { in: m.teamIds } }, select: { id: true } })).map((t) => t.id) : [];
    await notifyComment({ itemId: workItemId, actor: user, mentionedUserIds: users, mentionedTeamIds: teams });
    return { id: c.id };
  });
}

export async function editComment(commentId: string, body: RtDoc): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    const c = await db.comment.findUnique({ where: { id: commentId } });
    if (!c) throw new UserError("Comment not found.");
    if (c.authorId !== user.id) throw new ForbiddenError("You can only edit your own comments.");
    if (isDocEmpty(body)) throw new UserError("Comment is empty.");
    const doc = sanitizeDoc(body) as RtDoc;
    await db.comment.update({ where: { id: commentId }, data: { body: JSON.stringify(doc), bodyText: docToText(doc), editedAt: new Date() } });
    await linkCommentImages(commentId, c.workItemId, doc);
    await saveMentions(commentId, doc);
    return undefined;
  });
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    const c = await db.comment.findUnique({ where: { id: commentId } });
    if (!c) throw new UserError("Comment not found.");
    if (c.authorId !== user.id && user.role !== "ADMIN") throw new ForbiddenError("You can only delete your own comments.");
    await db.comment.delete({ where: { id: commentId } });
    return undefined;
  });
}

export async function toggleReaction(commentId: string, emoji: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    if (emoji.length > 8) throw new UserError("Invalid reaction.");
    const key = { commentId_userId_emoji: { commentId, userId: user.id, emoji } };
    const existing = await db.commentReaction.findUnique({ where: key });
    if (existing) await db.commentReaction.delete({ where: key });
    else await db.commentReaction.create({ data: { commentId, userId: user.id, emoji } });
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Links and follow
// ---------------------------------------------------------------------------

export async function addLink(itemId: number, kind: LinkKind, otherId: number): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    if (itemId === otherId) throw new UserError("An item cannot link to itself.");
    const [a, b] = await Promise.all([db.workItem.findUnique({ where: { id: itemId } }), db.workItem.findUnique({ where: { id: otherId } })]);
    if (!a || !b) throw new UserError(`Work item #${otherId} not found.`);
    if (a.projectId !== b.projectId) throw new UserError("Links must be within the same project.");
    switch (kind) {
      case "PARENT":
        await updateWorkItem(itemId, { parentId: otherId }, user);
        break;
      case "CHILD":
        await updateWorkItem(otherId, { parentId: itemId }, user);
        break;
      default: {
        const [type, sourceId, targetId] =
          kind === "BLOCKS"
            ? ["BLOCKS", itemId, otherId]
            : kind === "BLOCKED_BY"
              ? ["BLOCKS", otherId, itemId]
              : kind === "DUPLICATE_OF"
                ? ["DUPLICATE_OF", itemId, otherId]
                : kind === "DUPLICATED_BY"
                  ? ["DUPLICATE_OF", otherId, itemId]
                  : ["RELATED", Math.min(itemId, otherId), Math.max(itemId, otherId)];
        const exists = await db.workItemLink.findFirst({ where: { type: type as string, sourceId: sourceId as number, targetId: targetId as number } });
        if (exists) throw new UserError("That link already exists.");
        await db.workItemLink.create({ data: { type: type as string, sourceId: sourceId as number, targetId: targetId as number, createdById: user.id } });
        await db.historyEntry.create({
          data: { workItemId: itemId, rev: await nextRevFor(itemId), field: "link", oldValue: null, newValue: `${kind} #${otherId}`, changedById: user.id },
        });
      }
    }
    return undefined;
  });
}

async function nextRevFor(id: number) {
  const last = await db.historyEntry.findFirst({ where: { workItemId: id }, orderBy: { rev: "desc" }, select: { rev: true } });
  return (last?.rev ?? 0) + 1;
}

export async function removeLink(itemId: number, kind: LinkKind, otherId: number): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    switch (kind) {
      case "PARENT":
        await updateWorkItem(itemId, { parentId: null }, user);
        break;
      case "CHILD":
        await updateWorkItem(otherId, { parentId: null }, user);
        break;
      default: {
        await db.workItemLink.deleteMany({
          where: {
            OR: [
              { sourceId: itemId, targetId: otherId },
              { sourceId: otherId, targetId: itemId },
            ],
            type: kind === "BLOCKS" || kind === "BLOCKED_BY" ? "BLOCKS" : kind === "DUPLICATE_OF" || kind === "DUPLICATED_BY" ? "DUPLICATE_OF" : "RELATED",
          },
        });
        await db.historyEntry.create({
          data: { workItemId: itemId, rev: await nextRevFor(itemId), field: "link", oldValue: `${kind} #${otherId}`, newValue: null, changedById: user.id },
        });
      }
    }
    return undefined;
  });
}

export async function toggleFollow(itemId: number): Promise<ActionResult<{ following: boolean }>> {
  return run(async () => {
    const user = await getCurrentUser();
    if (!user) throw new ForbiddenError("Not signed in.");
    const key = { userId_workItemId: { userId: user.id, workItemId: itemId } };
    const existing = await db.follow.findUnique({ where: key });
    if (existing) {
      await db.follow.delete({ where: key });
      return { following: false };
    }
    await follow(user.id, itemId);
    return { following: true };
  });
}

export async function deleteAttachment(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireEditor();
    const a = await db.attachment.findUnique({ where: { id } });
    if (!a) throw new UserError("Attachment not found.");
    if (a.uploadedById !== user.id && user.role !== "ADMIN" && user.role !== "TEST_LEAD") throw new ForbiddenError("You can only delete your own attachments.");
    await db.attachment.delete({ where: { id } });
    await getStorage().delete(a.storageKey).catch(() => undefined);
    return undefined;
  });
}
