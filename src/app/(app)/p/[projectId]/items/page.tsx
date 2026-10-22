import { notFound } from "next/navigation";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadVisibleItems, loadProjectMeta } from "@/server/projects";
import { scopeMeta } from "@/server/projects";
import { loadQueries } from "@/server/queries";
import { filterFromParams } from "@/lib/filters";
import { columnsFromParam } from "@/lib/columns";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ItemList } from "@/components/list/ItemList";

export const metadata = { title: "Work items" };

export default async function ItemsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { user, access } = await projectPage(projectId);
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const [items, savedQueries] = await Promise.all([loadVisibleItems(access, meta), loadQueries(meta.id, user.id)]);
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const itemParam = Number(one("item"));
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <ItemList
        items={items}
        savedQueries={savedQueries}
        initialFilter={filterFromParams(sp)}
        initialOpenId={Number.isInteger(itemParam) && itemParam > 0 ? itemParam : null}
        initialColumns={columnsFromParam(one("cols"))}
        initialMode={one("view") === "tree" ? "tree" : "flat"}
      />
    </ProjectProvider>
  );
}
