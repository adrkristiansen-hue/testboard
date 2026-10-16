import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { loadItems, loadProjectMeta } from "@/server/projects";
import { filterFromParams } from "@/lib/filters";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ItemList } from "@/components/list/ItemList";

export const metadata = { title: "Work items" };

export default async function ItemsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  await requireUser();
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const items = await loadItems(meta);
  const itemParam = Number(Array.isArray(sp.item) ? sp.item[0] : sp.item);
  return (
    <ProjectProvider meta={meta}>
      <ItemList items={items} initialFilter={filterFromParams(sp)} initialOpenId={Number.isInteger(itemParam) && itemParam > 0 ? itemParam : null} />
    </ProjectProvider>
  );
}
