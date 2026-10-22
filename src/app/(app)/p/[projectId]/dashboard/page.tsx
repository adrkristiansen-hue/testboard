import { notFound } from "next/navigation";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { getT } from "@/server/locale";
import { db } from "@/server/db";
import { loadVisibleItems, loadProjectMeta, teamModuleIds } from "@/server/projects";
import { scopeMeta } from "@/server/projects";
import { currentPhase, loadColumns } from "@/server/boards";
import { computeBoardReport, computeDashboard, type BoardReport, type StateEvent } from "@/lib/dashboard";
import { ProjectProvider } from "@/components/ProjectProvider";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata = { title: "Dashboard" };

const FLOW_DAYS = [14, 30, 60, 90];

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ phase?: string; flowType?: string; days?: string; board?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { access } = await projectPage(projectId);
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const { t } = await getT();

  // Default to the running phase; "all" shows every phase.
  const phaseId = sp.phase === "all" ? "" : meta.phases.some((p) => p.id === sp.phase) ? sp.phase! : (currentPhase(meta.phases)?.id ?? "");
  const flowType = meta.types.some((ty) => ty.key === sp.flowType) ? sp.flowType! : "";
  const flowDays = FLOW_DAYS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  // A board report covers the same items as the team board: work in the board's modules.
  const board = sp.board && !access.hiddenBoards.has(sp.board) ? meta.teams.find((tm) => tm.id === sp.board) : undefined;
  const boardModules = board ? await teamModuleIds(board.id, meta) : null;
  const [items, history] = await Promise.all([
    loadVisibleItems(access, meta, boardModules ? { moduleId: { in: [...boardModules] } } : {}),
    db.historyEntry.findMany({
      where: { workItem: { projectId: meta.id }, field: { in: ["state", "__created"] } },
      select: { workItemId: true, field: true, oldValue: true, newValue: true, changedAt: true },
      orderBy: { changedAt: "asc" },
    }),
  ]);
  const events: StateEvent[] = history.map((h) => ({ itemId: h.workItemId, field: h.field as StateEvent["field"], from: h.oldValue, to: h.newValue, at: h.changedAt.toISOString() }));
  const now = new Date();
  const data = computeDashboard(items, events, meta, { now, phaseId, flowType, flowDays, unassignedLabel: t("common.unassigned"), noModuleLabel: t("dash.noModule") });
  let boardReport: BoardReport | null = null;
  if (board) {
    const scoped = phaseId ? items.filter((i) => i.phaseId === phaseId) : items;
    boardReport = computeBoardReport(scoped, events, await loadColumns(board.id), { now, flowDays, flowType }, meta.types);
  }

  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <Dashboard data={data} board={board ?? null} boardReport={boardReport} phaseId={phaseId || "all"} flowType={flowType} flowDays={flowDays} flowDayOptions={FLOW_DAYS} />
    </ProjectProvider>
  );
}
