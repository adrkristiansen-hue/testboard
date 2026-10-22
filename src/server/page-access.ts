import "server-only";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "./auth";
import { accessFor, can, canView, type ProjectAccess } from "./access";
import type { Permission } from "@/lib/permissions";

/** For project pages: the signed-in user and their access, or a 404 when they are not a member. */
export async function projectPage(projectId: string, need?: Permission): Promise<{ user: CurrentUser; access: ProjectAccess }> {
  const user = await requireUser();
  const access = await accessFor(user, projectId);
  if (!canView(access)) notFound();
  if (need && !can(access, need)) notFound();
  return { user, access };
}
