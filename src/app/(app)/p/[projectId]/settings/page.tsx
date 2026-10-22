import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadProjectMeta } from "@/server/projects";
import { scopeMeta } from "@/server/projects";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ProjectSettings } from "@/components/settings/ProjectSettings";
import { loadAccessData } from "@/server/access-admin";

export const metadata = { title: "Project settings" };

export default async function SettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { access } = await projectPage(projectId);
  if (!["project.configure", "boards.configure", "access.manage"].some((p) => access.permissions.has(p as never))) redirect(`/p/${projectId}/boards`);
  const meta = await loadProjectMeta(projectId);
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!meta || !project) notFound();
  const teams = (await db.team.findMany({ where: { projectId }, include: { members: true, modules: true }, orderBy: { name: "asc" } })).filter((tm) => !access.hiddenBoards.has(tm.id));
  const usage = await db.workItem.groupBy({ by: ["typeId"], where: { projectId }, _count: true });
  const accessData = access.permissions.has("access.manage") ? await loadAccessData(projectId) : null;
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <ProjectSettings
        description={project.description ?? ""}
        teams={teams.map((t) => ({ id: t.id, name: t.name, memberIds: t.members.map((m) => m.userId), modules: t.modules.map((m) => ({ moduleId: m.moduleId, includeChildren: m.includeChildren })) }))}
        typeUsage={Object.fromEntries(usage.map((u) => [u.typeId, u._count]))}
        accessData={accessData}
      />
    </ProjectProvider>
  );
}
