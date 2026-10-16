import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";

export default async function Home() {
  const user = await requireUser();
  // Prefer the board of a team the user belongs to; otherwise the first project.
  const membership = await db.teamMember.findFirst({ where: { userId: user.id }, include: { team: true } });
  if (membership) redirect(`/p/${membership.team.projectId}/boards/${membership.teamId}`);
  const project = await db.project.findFirst({ orderBy: { createdAt: "asc" } });
  if (project) redirect(`/p/${project.id}/boards`);
  redirect("/projects");
}
