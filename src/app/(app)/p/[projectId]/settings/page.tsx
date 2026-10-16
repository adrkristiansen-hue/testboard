import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { loadProjectMeta } from "@/server/projects";
import { canConfigure } from "@/lib/types";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ProjectSettings } from "@/components/settings/ProjectSettings";

export const metadata = { title: "Project settings" };

export default async function SettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!canConfigure(user.role)) redirect(`/p/${projectId}/boards`);
  const meta = await loadProjectMeta(projectId);
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!meta || !project) notFound();
  const teams = await db.team.findMany({ where: { projectId }, include: { members: true, modules: true }, orderBy: { name: "asc" } });
  const usage = await db.workItem.groupBy({ by: ["typeId"], where: { projectId }, _count: true });
  return (
    <ProjectProvider meta={meta}>
      <ProjectSettings
        description={project.description ?? ""}
        teams={teams.map((t) => ({ id: t.id, name: t.name, memberIds: t.members.map((m) => m.userId), modules: t.modules.map((m) => ({ moduleId: m.moduleId, includeChildren: m.includeChildren })) }))}
        typeUsage={Object.fromEntries(usage.map((u) => [u.typeId, u._count]))}
      />
    </ProjectProvider>
  );
}
