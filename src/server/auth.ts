import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { readSessionUserId } from "./session";
import type { Role, UserLite } from "@/lib/types";
import { canConfigure, canEdit, isAdmin } from "@/lib/types";

export type CurrentUser = UserLite;

/** The signed-in user, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, color: user.color, role: user.role as Role };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
  }
}

/** For server actions: throw instead of redirecting. */
export async function requireEditor(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Not signed in.");
  if (!canEdit(user.role)) throw new ForbiddenError("Read-only users cannot make changes.");
  return user;
}

export async function requireConfigurer(): Promise<CurrentUser> {
  const user = await requireEditor();
  if (!canConfigure(user.role)) throw new ForbiddenError("Only admins and test leads can change configuration.");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireEditor();
  if (!isAdmin(user.role)) throw new ForbiddenError("Only admins can do this.");
  return user;
}
