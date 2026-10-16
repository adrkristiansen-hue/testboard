import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { loadItems, loadProjectMeta } from "@/server/projects";
import { loadQueries } from "@/server/queries";
import { emptyQuery, type QueryDefinition } from "@/lib/query";
import { columnsFromParam, DEFAULT_COLUMNS } from "@/lib/columns";
import type { SavedQueryView } from "@/lib/types";
import { ProjectProvider } from "@/components/ProjectProvider";
import { QueryEditor } from "@/components/query/QueryEditor";

export const metadata = { title: "Query" };

function parseDef(raw: string | undefined): QueryDefinition {
  if (!raw) return emptyQuery();
  try {
    const v = JSON.parse(raw);
    if (v?.root && Array.isArray(v.root.clauses)) return v;
  } catch {
    /* ignore */
  }
  return emptyQuery();
}

export default async function QueryPage({ params, searchParams }: { params: Promise<{ projectId: string; queryId: string }>; searchParams: Promise<{ def?: string; cols?: string; mode?: string }> }) {
  const { projectId, queryId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const [items, queries] = await Promise.all([loadItems(meta), loadQueries(meta.id, user.id)]);
  let query: SavedQueryView | null;
  if (queryId === "new") {
    query = null;
  } else {
    query = queries.find((q) => q.id === queryId) ?? null;
    if (!query) notFound();
  }
  const draft = query ?? {
    id: "",
    name: "",
    shared: false,
    mode: sp.mode === "TREE" ? ("TREE" as const) : ("FLAT" as const),
    definition: parseDef(sp.def),
    columns: columnsFromParam(sp.cols) ?? DEFAULT_COLUMNS,
    ownerId: user.id,
    ownerName: user.name,
    updatedAt: new Date().toISOString(),
  };
  return (
    <ProjectProvider meta={meta}>
      <QueryEditor key={queryId} query={draft} isNew={!query} items={items} />
    </ProjectProvider>
  );
}
