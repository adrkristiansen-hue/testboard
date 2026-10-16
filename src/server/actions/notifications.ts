"use server";

import { z } from "zod";
import { db } from "../db";
import { getCurrentUser, ForbiddenError } from "../auth";
import { run, type ActionResult } from "../result";
import { loadNotifications, unreadCount } from "../notifications";
import type { NotificationView } from "@/lib/types";

async function me() {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Not signed in.");
  return user;
}

/** Unread count plus the latest notifications, for the header bell. */
export async function getNotificationSummary(): Promise<ActionResult<{ unread: number; latest: NotificationView[] }>> {
  return run(async () => {
    const user = await me();
    const [unread, latest] = await Promise.all([unreadCount(user.id), loadNotifications(user.id, { take: 12 })]);
    return { unread, latest };
  });
}

export async function markNotificationsRead(ids: string[], read = true): Promise<ActionResult> {
  return run(async () => {
    const user = await me();
    const parsed = z.array(z.string()).max(500).parse(ids);
    // Scoped to the current user so nobody can touch someone else's notifications.
    await db.notification.updateMany({ where: { id: { in: parsed }, userId: user.id }, data: { readAt: read ? new Date() : null } });
    return undefined;
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return run(async () => {
    const user = await me();
    await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return undefined;
  });
}

export async function setEmailNotifications(enabled: boolean): Promise<ActionResult> {
  return run(async () => {
    const user = await me();
    await db.user.update({ where: { id: user.id }, data: { emailNotifications: z.boolean().parse(enabled) } });
    return undefined;
  });
}
