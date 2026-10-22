import { notFound, redirect } from "next/navigation";
import { projectPage } from "@/server/page-access";
import { toClientAccess, visibleItemsWhere } from "@/server/access";
import { db } from "@/server/db";
import { loadProjectMeta } from "@/server/projects";
import { scopeMeta } from "@/server/projects";
import { currentPhase } from "@/server/boards";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ImportWizard } from "@/components/import/ImportWizard";

export const metadata = { title: "Import" };

export default async function ImportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { access } = await projectPage(projectId);
  if (!access.permissions.has("items.import")) redirect(`/p/${projectId}/items`);
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const ids = (await db.workItem.findMany({ where: { projectId, AND: [visibleItemsWhere(access)] }, select: { id: true } })).map((r) => r.id);
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <ImportWizard existingIds={ids} defaultPhaseId={currentPhase(meta.phases)?.id ?? null} />
    </ProjectProvider>
  );
}
