import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadVisibleItems, loadProjectMeta, teamModuleIds } from "@/server/projects";
import { scopeMeta } from "@/server/projects";
import { currentPhase, loadColumns } from "@/server/boards";
import { parseSwimlaneConfig } from "@/lib/swimlanes";
import { parseCardConfig } from "@/lib/cards";
import { filterFromParams } from "@/lib/filters";
import { loadQueries } from "@/server/queries";
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
  const { user, access } = await projectPage(projectId);
  const meta = await loadProjectMeta(projectId);
  const team = await db.team.findFirst({ where: { id: teamId, projectId }, include: { members: true, modules: { include: { module: true } } } });
  if (!meta || !team || access.hiddenBoards.has(team.id)) notFound();

  const moduleIds = await teamModuleIds(team.id, meta);
  const [items, columns, savedQueries] = await Promise.all([loadVisibleItems(access, meta, { moduleId: { in: [...moduleIds] } }), loadColumns(team.id), loadQueries(meta.id, user.id)]);
  const firstModule = [...team.modules].sort((a, b) => a.module.order - b.module.order)[0]?.moduleId ?? null;
  const itemParam = Number(Array.isArray(sp.item) ? sp.item[0] : sp.item);

  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <Board
        team={{ id: team.id, name: team.name }}
        teams={scopeMeta(meta, access).teams}
        columns={columns}
        swimlanes={parseSwimlaneConfig(team.swimlanes)}
        cardConfig={parseCardConfig(team.cardConfig)}
        items={items}
        memberIds={team.members.map((m) => m.userId)}
        defaults={{ moduleId: firstModule, phaseId: currentPhase(meta.phases)?.id ?? null }}
        initialFilter={filterFromParams(sp)}
        savedQueries={savedQueries}
        initialOpenId={Number.isInteger(itemParam) && itemParam > 0 ? itemParam : null}
      />
    </ProjectProvider>
  );
}
