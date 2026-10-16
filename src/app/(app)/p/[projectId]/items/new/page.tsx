import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { loadItems, loadProjectMeta } from "@/server/projects";
import { currentPhase } from "@/server/boards";
import { defectDefaultsFromTest, type NewItemDefaults } from "@/lib/prefill";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ItemPage } from "@/components/item/ItemPage";

export const metadata = { title: "New work item" };

export default async function NewItemPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ type?: string; from?: string; parent?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  await requireUser();
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  let defaults: NewItemDefaults = { phaseId: currentPhase(meta.phases)?.id ?? null };
  const type = meta.types.find((t) => t.key === sp.type || t.id === sp.type);
  if (type) defaults.typeId = type.id;
  if (sp.parent) defaults.parentId = Number(sp.parent) || null;
  if (sp.from) {
    const [source] = await loadItems(meta, { id: Number(sp.from) });
    if (source) defaults = defectDefaultsFromTest(source, meta.types);
  }
  return (
    <ProjectProvider meta={meta}>
      <ItemPage itemId={null} newDefaults={defaults} />
    </ProjectProvider>
  );
}
