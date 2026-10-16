import "server-only";
import { db } from "./db";
import { itemViewInclude, loadProjectMeta, toItemView } from "./projects";
import { parseDoc, emptyDoc } from "@/lib/richtext";
import type { HistoryRev, ItemDetail, LinkedItem } from "@/lib/detail-types";

const linkedSelect = { id: true, title: true, state: true, typeId: true, assignedToId: true } as const;

export async function loadItemDetail(id: number, userId: string): Promise<ItemDetail | null> {
  const row = await db.workItem.findUnique({
    where: { id },
    include: {
      ...itemViewInclude,
      parent: { select: linkedSelect },
      children: { select: { ...linkedSelect } },
      linksFrom: { include: { target: { select: linkedSelect } } },
      linksTo: { include: { source: { select: linkedSelect } } },
      comments: { include: { reactions: true }, orderBy: { createdAt: "asc" } },
      history: { orderBy: [{ rev: "desc" }, { field: "asc" }] },
      attachments: { orderBy: { createdAt: "asc" } },
      follows: { where: { userId }, select: { userId: true } },
    },
  });
  if (!row) return null;
  const meta = await loadProjectMeta(row.projectId);
  if (!meta) return null;
  const types = new Map(meta.types.map((t) => [t.id, t]));
  const view = toItemView(row, types);

  const links: LinkedItem[] = [];
  if (row.parent) links.push({ kind: "PARENT", item: row.parent });
  for (const c of row.children) links.push({ kind: "CHILD", item: c });
  for (const l of row.linksFrom) {
    const kind = l.type === "BLOCKS" ? "BLOCKS" : l.type === "DUPLICATE_OF" ? "DUPLICATE_OF" : "RELATED";
    links.push({ kind, item: l.target });
  }
  for (const l of row.linksTo) {
    const kind = l.type === "BLOCKS" ? "BLOCKED_BY" : l.type === "DUPLICATE_OF" ? "DUPLICATED_BY" : "RELATED";
    links.push({ kind, item: l.source });
  }

  const revs = new Map<number, HistoryRev>();
  for (const h of row.history) {
    let r = revs.get(h.rev);
    if (!r) {
      r = { rev: h.rev, changedById: h.changedById, changedAt: h.changedAt.toISOString(), changes: [] };
      revs.set(h.rev, r);
    }
    r.changes.push({ field: h.field, oldValue: h.oldValue, newValue: h.newValue });
  }

  return {
    projectId: row.projectId,
    item: { ...view, description: parseDoc(row.description), changedById: row.changedById },
    comments: row.comments.map((c) => {
      const byEmoji = new Map<string, string[]>();
      for (const r of c.reactions) byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.userId]);
      return {
        id: c.id,
        authorId: c.authorId,
        body: parseDoc(c.body) ?? emptyDoc(),
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt?.toISOString() ?? null,
        reactions: [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
      };
    }),
    history: [...revs.values()].sort((a, b) => b.rev - a.rev),
    links,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt.toISOString(),
      uploadedById: a.uploadedById,
      commentId: a.commentId,
    })),
    following: row.follows.length > 0,
  };
}
