import "server-only";
import { db } from "./db";
import { loadProjectMeta } from "./projects";
import { isClosedCategory, type StateCategory } from "@/lib/workflow";
import type { TypeLite } from "@/lib/types";

export interface MyWorkRow {
  id: number;
  title: string;
  projectId: string;
  projectKey: string;
  state: string;
  stateColor: string;
  stateOrder: number;
  category: StateCategory | undefined;
  type: Pick<TypeLite, "icon" | "color" | "name"> | undefined;
  priority: number;
  dueDate: string | null;
  changedAt: string;
}

export interface MentionRow {
  commentId: string;
  item: MyWorkRow;
  authorName: string;
  authorColor: string;
  excerpt: string;
  createdAt: string;
  viaTeam: string | null;
}

type ItemRow = { id: number; title: string; projectId: string; typeId: string; state: string; priority: number; dueDate: Date | null; changedAt: Date };

const itemSelect = { id: true, title: true, projectId: true, typeId: true, state: true, priority: true, dueDate: true, changedAt: true } as const;

async function rowMapper(projectIds: Iterable<string>) {
  const metas = new Map<string, Awaited<ReturnType<typeof loadProjectMeta>>>();
  for (const id of new Set(projectIds)) metas.set(id, await loadProjectMeta(id));
  return (r: ItemRow): MyWorkRow => {
    const meta = metas.get(r.projectId);
    const type = meta?.types.find((t) => t.id === r.typeId);
    const st = type?.states.find((s) => s.name === r.state);
    return {
      id: r.id,
      title: r.title,
      projectId: r.projectId,
      projectKey: meta?.key ?? "",
      state: r.state,
      stateColor: st?.color ?? "#999",
      stateOrder: st?.order ?? 0,
      category: st?.category,
      type: type ? { icon: type.icon, color: type.color, name: type.name } : undefined,
      priority: r.priority,
      dueDate: r.dueDate?.toISOString() ?? null,
      changedAt: r.changedAt.toISOString(),
    };
  };
}

export async function loadMyWork(userId: string, opts: { includeClosed: boolean }) {
  const [assignedRaw, followRaw, teams] = await Promise.all([
    db.workItem.findMany({ where: { assignedToId: userId }, select: itemSelect, orderBy: [{ priority: "asc" }, { changedAt: "desc" }], take: 1000 }),
    db.follow.findMany({ where: { userId }, select: { workItem: { select: itemSelect } }, take: 1000 }),
    db.teamMember.findMany({ where: { userId }, select: { teamId: true } }),
  ]);
  const teamIds = teams.map((t) => t.teamId);
  const mentionsRaw = await db.mention.findMany({
    where: { OR: [{ userId }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])] },
    select: {
      team: { select: { name: true } },
      comment: { select: { id: true, bodyText: true, createdAt: true, authorId: true, author: { select: { name: true, color: true } }, workItem: { select: itemSelect } } },
    },
    orderBy: { comment: { createdAt: "desc" } },
    take: 100,
  });

  const toRow = await rowMapper([...assignedRaw.map((r) => r.projectId), ...followRaw.map((f) => f.workItem.projectId), ...mentionsRaw.map((m) => m.comment.workItem.projectId)]);

  const assignedAll = assignedRaw.map(toRow);
  const open = assignedAll.filter((r) => !isClosedCategory(r.category));
  const closed = assignedAll.filter((r) => isClosedCategory(r.category)).sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  // One entry per comment (a comment can mention both the user and their team), never your own comments.
  const seen = new Set<string>();
  const mentions: MentionRow[] = [];
  for (const m of mentionsRaw) {
    if (m.comment.authorId === userId || seen.has(m.comment.id)) continue;
    seen.add(m.comment.id);
    mentions.push({
      commentId: m.comment.id,
      item: toRow(m.comment.workItem),
      authorName: m.comment.author.name,
      authorColor: m.comment.author.color,
      excerpt: m.comment.bodyText.length > 160 ? m.comment.bodyText.slice(0, 157) + "…" : m.comment.bodyText,
      createdAt: m.comment.createdAt.toISOString(),
      viaTeam: m.team?.name ?? null,
    });
  }

  const following = followRaw
    .map((f) => toRow(f.workItem))
    .filter((r) => opts.includeClosed || !isClosedCategory(r.category))
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  return { open, closed: opts.includeClosed ? closed.slice(0, 100) : [], closedCount: closed.length, mentions, following };
}
