import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { appUrl, emailEnabled, sendMail } from "./email";
import { buildNotificationEmail, type NotificationType } from "@/lib/email";

interface Change {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

async function send(userIds: Iterable<string>, type: NotificationType, workItemId: number, actor: CurrentUser, message: string) {
  const ids = [...new Set(userIds)].filter((id) => id !== actor.id);
  if (ids.length === 0) return;
  // Only notify active users.
  const users = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true, email: true, emailNotifications: true } });
  if (users.length === 0) return;
  await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, type, workItemId, actorId: actor.id, message })) });
  if (!emailEnabled()) return;
  const recipients = users.filter((u) => u.emailNotifications);
  if (recipients.length === 0) return;
  const item = await db.workItem.findUnique({ where: { id: workItemId }, select: { title: true, projectId: true, project: { select: { name: true } } } });
  if (!item) return;
  await sendMail(
    recipients.map((u) =>
      buildNotificationEmail({
        to: u.email,
        recipientName: u.name,
        type,
        message,
        itemId: workItemId,
        itemTitle: item.title,
        projectId: item.projectId,
        projectName: item.project.name,
        appUrl: appUrl(),
      }),
    ),
  );
}

async function followerIds(workItemId: number): Promise<string[]> {
  const rows = await db.follow.findMany({ where: { workItemId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

export async function follow(userId: string, workItemId: number) {
  await db.follow.upsert({
    where: { userId_workItemId: { userId, workItemId } },
    create: { userId, workItemId },
    update: {},
  });
}

/** Called by the work item service after every create/update. */
export async function notifyItemChange(args: { itemId: number; actor: CurrentUser; created: boolean; changes: Change[]; suppressAssignedNotification?: boolean }) {
  const { itemId, actor, changes } = args;
  const item = await db.workItem.findUnique({ where: { id: itemId }, select: { title: true } });
  if (!item) return;
  const assigned = changes.find((c) => c.field === "assignedToId");
  if (assigned?.newValue) {
    await follow(assigned.newValue, itemId);
    if (!args.suppressAssignedNotification) await send([assigned.newValue], "ASSIGNED", itemId, actor, `${actor.name} assigned you #${itemId} ${item.title}`);
  }
  if (args.created) return;
  const state = changes.find((c) => c.field === "state");
  if (state) {
    const followers = await followerIds(itemId);
    await send(followers, "STATE_CHANGED", itemId, actor, `${actor.name} changed #${itemId} ${item.title}: ${state.oldValue} → ${state.newValue}`);
  }
}

/** One summary notification per assignee after a bulk create/assign. Links to the first item. */
export async function notifyBulkAssigned(actor: CurrentUser, byAssignee: Map<string, number[]>) {
  for (const [userId, ids] of byAssignee) {
    if (ids.length === 0) continue;
    const sorted = [...ids].sort((a, b) => a - b);
    if (sorted.length === 1) {
      const item = await db.workItem.findUnique({ where: { id: sorted[0] }, select: { title: true } });
      await send([userId], "ASSIGNED", sorted[0], actor, `${actor.name} assigned you #${sorted[0]} ${item?.title ?? ""}`.trim());
      continue;
    }
    const list = sorted.length <= 6 ? sorted.map((i) => `#${i}`).join(", ") : `${sorted.slice(0, 5).map((i) => `#${i}`).join(", ")} …`;
    await send([userId], "ASSIGNED", sorted[0], actor, `${actor.name} assigned you ${sorted.length} work items: ${list}`);
  }
}

/** Called after a comment is created: mentions first, then followers. */
export async function notifyComment(args: { itemId: number; actor: CurrentUser; mentionedUserIds: string[]; mentionedTeamIds: string[] }) {
  const { itemId, actor } = args;
  const item = await db.workItem.findUnique({ where: { id: itemId }, select: { title: true } });
  if (!item) return;
  const teamMembers = args.mentionedTeamIds.length
    ? (await db.teamMember.findMany({ where: { teamId: { in: args.mentionedTeamIds } }, select: { userId: true } })).map((m) => m.userId)
    : [];
  const mentioned = new Set([...args.mentionedUserIds, ...teamMembers]);
  await send(mentioned, "MENTIONED", itemId, actor, `${actor.name} mentioned you on #${itemId} ${item.title}`);
  const followers = (await followerIds(itemId)).filter((id) => !mentioned.has(id));
  await send(followers, "COMMENTED", itemId, actor, `${actor.name} commented on #${itemId} ${item.title}`);
  await follow(actor.id, itemId);
}
