import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadProjectMeta } from "@/server/projects";
import { scopeMeta } from "@/server/projects";
import { loadColumns } from "@/server/boards";
import { parseSwimlaneConfig } from "@/lib/swimlanes";
import { parseCardConfig } from "@/lib/cards";
import { ProjectProvider } from "@/components/ProjectProvider";
import { BoardSettings } from "@/components/settings/BoardSettings";

export const metadata = { title: "Board settings" };

export default async function BoardSettingsPage({ params }: { params: Promise<{ projectId: string; teamId: string }> }) {
  const { projectId, teamId } = await params;
  const { access } = await projectPage(projectId);
  if (!access.permissions.has("boards.configure") || access.hiddenBoards.has(teamId)) redirect(`/p/${projectId}/boards/${teamId}`);
  const meta = await loadProjectMeta(projectId);
  const team = await db.team.findFirst({ where: { id: teamId, projectId } });
  if (!meta || !team) notFound();
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <BoardSettings teamId={team.id} teamName={team.name} columns={await loadColumns(team.id)} swimlanes={parseSwimlaneConfig(team.swimlanes)} cardConfig={parseCardConfig(team.cardConfig)} />
    </ProjectProvider>
  );
}
