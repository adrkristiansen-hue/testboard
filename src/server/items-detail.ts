import "server-only";
import { db } from "./db";
import { itemViewInclude, loadProjectMeta, toItemView } from "./projects";
import { parseDoc, emptyDoc } from "@/lib/richtext";
import type { HistoryRev, ItemDetail, LinkedItem } from "@/lib/detail-types";
import { can, type ProjectAccess } from "./access";

const linkedSelect = { id: true, title: true, state: true, typeId: true, assignedToId: true, moduleId: true } as const;
type LinkedRow = { id: number; title: string; state: string; typeId: string; assignedToId: string | null; moduleId: string | null };

/** Full work item for the form. Hides internal comments and linked items the user may not see. */
export async function loadItemDetail(id: number, userId: string, access: ProjectAccess): Promise<ItemDetail | null> {
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

  const visible = (m: { moduleId: string | null }) => !m.moduleId || !access.lockedModules.has(m.moduleId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop moduleId from the client payload
  const strip = ({ moduleId, ...rest }: LinkedRow) => rest;
  const links: LinkedItem[] = [];
  if (row.parent && visible(row.parent)) links.push({ kind: "PARENT", item: strip(row.parent) });
  for (const c of row.children) if (visible(c)) links.push({ kind: "CHILD", item: strip(c) });
  for (const l of row.linksFrom) {
    if (!visible(l.target)) continue;
    const kind = l.type === "BLOCKS" ? "BLOCKS" : l.type === "DUPLICATE_OF" ? "DUPLICATE_OF" : "RELATED";
    links.push({ kind, item: strip(l.target) });
  }
  for (const l of row.linksTo) {
    if (!visible(l.source)) continue;
    const kind = l.type === "BLOCKS" ? "BLOCKED_BY" : l.type === "DUPLICATE_OF" ? "DUPLICATED_BY" : "RELATED";
    links.push({ kind, item: strip(l.source) });
  }
  const seesInternal = can(access, "comments.internal");
  const comments = row.comments.filter((c) => seesInternal || !c.internal);
  const hiddenComments = new Set(row.comments.filter((c) => !comments.includes(c)).map((c) => c.id));

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
    comments: comments.map((c) => {
      const byEmoji = new Map<string, string[]>();
      for (const r of c.reactions) byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.userId]);
      return {
        id: c.id,
        authorId: c.authorId,
        body: parseDoc(c.body) ?? emptyDoc(),
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt?.toISOString() ?? null,
        internal: c.internal,
        reactions: [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
      };
    }),
    history: [...revs.values()].sort((a, b) => b.rev - a.rev),
    links,
    attachments: row.attachments.filter((a) => !a.commentId || !hiddenComments.has(a.commentId)).map((a) => ({
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
