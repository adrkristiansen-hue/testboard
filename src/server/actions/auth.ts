"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { clearSessionCookie, readSessionUserId, setSessionCookie } from "../session";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { audit } from "../audit";
import { findValidInvite } from "../invites";

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  // Compare even when the user is missing to keep timing similar.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    // Record failed attempts for known accounts (not for unknown e-mails, to keep the log free of typos).
    if (user) await audit(null, "auth.loginFailed", "User", user.id);
    return { error: "login.failed" };
  }
  await setSessionCookie(user.id);
  await audit(user.id, "auth.login", "User", user.id);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

/** Set a password from an invite link, then sign in. */
export async function acceptInvite(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const invite = await findValidInvite(token);
  if (!invite) return { error: "invite.invalid" };
  if (password.length < 10) return { error: "invite.tooShort" };
  if (password !== confirm) return { error: "invite.mismatch" };
  await db.user.update({ where: { id: invite.userId }, data: { passwordHash: await bcrypt.hash(password, 10), authProvider: "PASSWORD" } });
  await db.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
  await setSessionCookie(invite.userId);
  await audit(invite.userId, "auth.inviteAccepted", "User", invite.userId);
  redirect("/");
}

export async function logout() {
  const userId = await readSessionUserId();
  if (userId) await audit(userId, "auth.logout", "User", userId);
  await clearSessionCookie();
  redirect("/login");
}

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
