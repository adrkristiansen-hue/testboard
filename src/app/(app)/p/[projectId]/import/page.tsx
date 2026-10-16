import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { loadProjectMeta } from "@/server/projects";
import { currentPhase } from "@/server/boards";
import { canConfigure } from "@/lib/types";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ImportWizard } from "@/components/import/ImportWizard";

export const metadata = { title: "Import" };

export default async function ImportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!canConfigure(user.role)) redirect(`/p/${projectId}/items`);
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const ids = (await db.workItem.findMany({ where: { projectId }, select: { id: true } })).map((r) => r.id);
  return (
    <ProjectProvider meta={meta}>
      <ImportWizard existingIds={ids} defaultPhaseId={currentPhase(meta.phases)?.id ?? null} />
    </ProjectProvider>
  );
}
