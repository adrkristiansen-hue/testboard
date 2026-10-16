import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { db } from "@/server/db";
import { loadItems, loadProjectMeta } from "@/server/projects";
import { currentPhase } from "@/server/boards";
import { computeDashboard, type StateEvent } from "@/lib/dashboard";
import { ProjectProvider } from "@/components/ProjectProvider";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata = { title: "Dashboard" };

const FLOW_DAYS = [14, 30, 60, 90];

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ phase?: string; flowType?: string; days?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  await requireUser();
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const { t } = await getT();

  // Default to the running phase; "all" shows every phase.
  const phaseId = sp.phase === "all" ? "" : meta.phases.some((p) => p.id === sp.phase) ? sp.phase! : (currentPhase(meta.phases)?.id ?? "");
  const flowType = meta.types.some((ty) => ty.key === sp.flowType) ? sp.flowType! : "";
  const flowDays = FLOW_DAYS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const [items, history] = await Promise.all([
    loadItems(meta),
    db.historyEntry.findMany({
      where: { workItem: { projectId: meta.id }, field: { in: ["state", "__created"] } },
      select: { workItemId: true, field: true, oldValue: true, newValue: true, changedAt: true },
      orderBy: { changedAt: "asc" },
    }),
  ]);
  const events: StateEvent[] = history.map((h) => ({ itemId: h.workItemId, field: h.field as StateEvent["field"], from: h.oldValue, to: h.newValue, at: h.changedAt.toISOString() }));
  const data = computeDashboard(items, events, meta, { now: new Date(), phaseId, flowType, flowDays, unassignedLabel: t("common.unassigned"), noModuleLabel: t("dash.noModule") });

  return (
    <ProjectProvider meta={meta}>
      <Dashboard data={data} phaseId={phaseId || "all"} flowType={flowType} flowDays={flowDays} flowDayOptions={FLOW_DAYS} />
    </ProjectProvider>
  );
}
