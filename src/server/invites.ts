import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { appUrl, emailEnabled, sendMail } from "./email";
import { escapeHtml } from "@/lib/email";

const INVITE_DAYS = 14;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a fresh invite link for a user (older unused links stop working). Returns the path /invite/<token>. */
export async function createInvite(userId: string, createdById: string): Promise<{ path: string; expiresAt: Date }> {
  await db.invite.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date(0) } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db.invite.create({ data: { userId, tokenHash: hashInviteToken(token), expiresAt, createdById } });
  return { path: `/invite/${token}`, expiresAt };
}

export async function findValidInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{30,}$/.test(token)) return null;
  const inv = await db.invite.findUnique({ where: { tokenHash: hashInviteToken(token) }, include: { user: true } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date() || !inv.user.active) return null;
  return inv;
}

/** E-mail the invite when e-mail is configured. Returns true when sent. */
export async function sendInviteEmail(to: { email: string; name: string }, projectName: string, inviter: string, path: string): Promise<boolean> {
  if (!emailEnabled()) return false;
  const url = `${appUrl().replace(/\/+$/, "")}${path}`;
  await sendMail([
    {
      to: to.email.replace(/[\r\n]/g, ""),
      subject: `${inviter} invited you to ${projectName} in TestBoard`.replace(/[\r\n]/g, " "),
      text: `Hi ${to.name},\n\n${inviter} has given you access to ${projectName} in TestBoard.\n\nSet your password and sign in: ${url}\n\nThe link works for ${INVITE_DAYS} days.`,
      html: `<p>Hi ${escapeHtml(to.name)},</p><p>${escapeHtml(inviter)} has given you access to <b>${escapeHtml(projectName)}</b> in TestBoard.</p><p><a href="${escapeHtml(url)}">Set your password and sign in</a></p><p style="color:#64748b;font-size:12px">The link works for ${INVITE_DAYS} days.</p>`,
    },
  ]);
  return true;
}
