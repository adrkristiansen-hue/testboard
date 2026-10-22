import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { visibleProjectIds } from "@/server/access";

export default async function Home() {
  const user = await requireUser();
  const projectIds = await visibleProjectIds(user);
  // Prefer the board of a team the user belongs to; otherwise the first project they can open.
  const membership = await db.teamMember.findFirst({ where: { userId: user.id, team: { projectId: { in: projectIds } } }, include: { team: true } });
  if (membership) redirect(`/p/${membership.team.projectId}/boards/${membership.teamId}`);
  const project = await db.project.findFirst({ where: { id: { in: projectIds } }, orderBy: { createdAt: "asc" } });
  if (project) redirect(`/p/${project.id}/boards`);
  redirect("/projects");
}
