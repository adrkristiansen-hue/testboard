import Link from "next/link";
import { notFound } from "next/navigation";
import { projectPage } from "@/server/page-access";
import { getT } from "@/server/locale";
import { loadProjectMeta } from "@/server/projects";
import { loadQueries } from "@/server/queries";
import { formatDate } from "@/lib/format";
import type { SavedQueryView } from "@/lib/types";

export const metadata = { title: "Queries" };

export default async function QueriesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user } = await projectPage(projectId);
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const { t, locale } = await getT();
  const queries = await loadQueries(meta.id, user.id);
  const mine = queries.filter((q) => !q.shared && q.ownerId === user.id);
  const shared = queries.filter((q) => q.shared);

  const table = (list: SavedQueryView[], title: string, id: string) => (
    <section aria-labelledby={id} className="card-panel">
      <h2 id={id} className="border-b border-line px-3 py-2 font-semibold">
        {title} <span className="font-normal text-ink-muted">({list.length})</span>
      </h2>
      {list.length === 0 ? (
        <p className="px-3 py-4 text-sm text-ink-muted">{t("query.empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th scope="col" className="px-3 py-1.5 font-semibold">{t("common.name")}</th>
              <th scope="col" className="px-3 py-1.5 font-semibold">{t("query.mode")}</th>
              <th scope="col" className="px-3 py-1.5 font-semibold">{t("query.owner")}</th>
              <th scope="col" className="px-3 py-1.5 font-semibold">{t("field.changedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((q) => (
              <tr key={q.id} className="border-t border-line">
                <td className="px-3 py-1.5">
                  <Link href={`/p/${meta.id}/queries/${q.id}`} className="font-medium text-brand hover:underline">
                    {q.name}
                  </Link>
                </td>
                <td className="px-3 py-1.5">{q.mode === "TREE" ? t("query.tree") : t("query.flat")}</td>
                <td className="px-3 py-1.5">{q.ownerName}</td>
                <td className="px-3 py-1.5 text-ink-muted">{formatDate(q.updatedAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  return (
    <main className="w-full max-w-4xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">{t("nav.queries")}</h1>
        <Link href={`/p/${meta.id}/queries/new`} className="btn btn-primary btn-sm">
          + {t("query.new")}
        </Link>
      </div>
      {table(mine, t("query.mine"), "q-mine")}
      {table(shared, t("query.sharedQueries"), "q-shared")}
    </main>
  );
}
