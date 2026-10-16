"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { clearSessionCookie, setSessionCookie } from "../session";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { audit } from "../audit";

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  // Compare even when the user is missing to keep timing similar.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) return { error: "login.failed" };
  await setSessionCookie(user.id);
  await audit(user.id, "auth.login", "User", user.id);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
