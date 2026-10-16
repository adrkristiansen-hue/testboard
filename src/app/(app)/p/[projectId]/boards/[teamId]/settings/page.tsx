import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { loadProjectMeta } from "@/server/projects";
import { loadColumns } from "@/server/boards";
import { parseSwimlaneConfig } from "@/lib/swimlanes";
import { parseCardConfig } from "@/lib/cards";
import { canConfigure } from "@/lib/types";
import { ProjectProvider } from "@/components/ProjectProvider";
import { BoardSettings } from "@/components/settings/BoardSettings";

export const metadata = { title: "Board settings" };

export default async function BoardSettingsPage({ params }: { params: Promise<{ projectId: string; teamId: string }> }) {
  const { projectId, teamId } = await params;
  const user = await requireUser();
  if (!canConfigure(user.role)) redirect(`/p/${projectId}/boards/${teamId}`);
  const meta = await loadProjectMeta(projectId);
  const team = await db.team.findFirst({ where: { id: teamId, projectId } });
  if (!meta || !team) notFound();
  return (
    <ProjectProvider meta={meta}>
      <BoardSettings teamId={team.id} teamName={team.name} columns={await loadColumns(team.id)} swimlanes={parseSwimlaneConfig(team.swimlanes)} cardConfig={parseCardConfig(team.cardConfig)} />
    </ProjectProvider>
  );
}
