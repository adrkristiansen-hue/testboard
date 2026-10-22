import { notFound } from "next/navigation";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadVisibleItems, loadProjectMeta } from "@/server/projects";
import { scopeMeta } from "@/server/projects";
import { currentPhase } from "@/server/boards";
import { defectDefaultsFromTest, type NewItemDefaults } from "@/lib/prefill";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ItemPage } from "@/components/item/ItemPage";

export const metadata = { title: "New work item" };

export default async function NewItemPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ type?: string; from?: string; parent?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { access } = await projectPage(projectId, "items.create");
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  let defaults: NewItemDefaults = { phaseId: currentPhase(meta.phases)?.id ?? null };
  const type = meta.types.find((t) => t.key === sp.type || t.id === sp.type);
  if (type) defaults.typeId = type.id;
  if (sp.parent) defaults.parentId = Number(sp.parent) || null;
  if (sp.from) {
    const [source] = await loadVisibleItems(access, meta, { id: Number(sp.from) || -1 });
    if (source) defaults = defectDefaultsFromTest(source, meta.types);
  }
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <ItemPage itemId={null} newDefaults={defaults} />
    </ProjectProvider>
  );
}
