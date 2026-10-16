import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";

type NotificationType = "ASSIGNED" | "MENTIONED" | "STATE_CHANGED" | "COMMENTED";

interface Change {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

async function send(userIds: Iterable<string>, type: NotificationType, workItemId: number, actor: CurrentUser, message: string) {
  const ids = [...new Set(userIds)].filter((id) => id !== actor.id);
  if (ids.length === 0) return;
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, type, workItemId, actorId: actor.id, message })) });
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED === "true") {
    // Email stub: replace with a real mail transport (SMTP, SendGrid, Graph API...).
    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { email: true } });
    for (const u of users) console.info(`[email stub] to=${u.email} subject="#${workItemId}: ${message}"`);
  }
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
export async function notifyItemChange(args: { itemId: number; actor: CurrentUser; created: boolean; changes: Change[] }) {
  const { itemId, actor, changes } = args;
  const item = await db.workItem.findUnique({ where: { id: itemId }, select: { title: true } });
  if (!item) return;
  const assigned = changes.find((c) => c.field === "assignedToId");
  if (assigned?.newValue) {
    await follow(assigned.newValue, itemId);
    await send([assigned.newValue], "ASSIGNED", itemId, actor, `${actor.name} assigned you #${itemId} ${item.title}`);
  }
  if (args.created) return;
  const state = changes.find((c) => c.field === "state");
  if (state) {
    const followers = await followerIds(itemId);
    await send(followers, "STATE_CHANGED", itemId, actor, `${actor.name} changed #${itemId} ${item.title}: ${state.oldValue} → ${state.newValue}`);
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
