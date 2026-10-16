import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { loadItems, loadProjectMeta, teamModuleIds } from "@/server/projects";
import { currentPhase, loadColumns } from "@/server/boards";
import { parseSwimlaneConfig } from "@/lib/swimlanes";
import { parseCardConfig } from "@/lib/cards";
import { filterFromParams } from "@/lib/filters";
import { ProjectProvider } from "@/components/ProjectProvider";
import { Board } from "@/components/board/Board";

type Params = { projectId: string; teamId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { teamId } = await params;
  const team = await db.team.findUnique({ where: { id: teamId }, select: { name: true } });
  return { title: team ? `${team.name} board` : "Board" };
}

export default async function BoardPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId, teamId } = await params;
  const sp = await searchParams;
  await requireUser();
  const meta = await loadProjectMeta(projectId);
  const team = await db.team.findFirst({ where: { id: teamId, projectId }, include: { members: true, modules: { include: { module: true } } } });
  if (!meta || !team) notFound();

  const moduleIds = await teamModuleIds(team.id, meta);
  const [items, columns] = await Promise.all([loadItems(meta, { moduleId: { in: [...moduleIds] } }), loadColumns(team.id)]);
  const firstModule = [...team.modules].sort((a, b) => a.module.order - b.module.order)[0]?.moduleId ?? null;
  const itemParam = Number(Array.isArray(sp.item) ? sp.item[0] : sp.item);

  return (
    <ProjectProvider meta={meta}>
      <Board
        team={{ id: team.id, name: team.name }}
        teams={meta.teams}
        columns={columns}
        swimlanes={parseSwimlaneConfig(team.swimlanes)}
        cardConfig={parseCardConfig(team.cardConfig)}
        items={items}
        memberIds={team.members.map((m) => m.userId)}
        defaults={{ moduleId: firstModule, phaseId: currentPhase(meta.phases)?.id ?? null }}
        initialFilter={filterFromParams(sp)}
        initialOpenId={Number.isInteger(itemParam) && itemParam > 0 ? itemParam : null}
      />
    </ProjectProvider>
  );
}
