import "server-only";
import { db } from "./db";
import type { NotificationView } from "@/lib/types";

const notificationSelect = {
  id: true,
  type: true,
  message: true,
  readAt: true,
  createdAt: true,
  workItemId: true,
  actor: { select: { id: true, name: true, color: true } },
  workItem: { select: { title: true, projectId: true } },
} as const;

export async function loadNotifications(userId: string, opts: { unreadOnly?: boolean; take?: number } = {}): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    select: notificationSelect,
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    read: !!r.readAt,
    createdAt: r.createdAt.toISOString(),
    workItemId: r.workItemId,
    itemTitle: r.workItem?.title ?? null,
    projectId: r.workItem?.projectId ?? null,
    actor: r.actor,
  }));
}

export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
