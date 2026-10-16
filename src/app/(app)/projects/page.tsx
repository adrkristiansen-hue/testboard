import Link from "next/link";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { canConfigure } from "@/lib/types";
import { NewProjectForm } from "@/components/settings/NewProjectForm";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const { t } = await getT();
  const projects = await db.project.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { workItems: true, teams: true } } } });
  return (
    <main className="mx-auto w-full max-w-4xl p-4">
      <h1 className="mb-4 text-lg font-semibold">{t("nav.projects")}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id} className="card-panel p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{p.key}</div>
            <Link href={`/p/${p.id}/boards`} className="text-base font-semibold text-brand hover:underline">
              {p.name}
            </Link>
            {p.description && <p className="mt-1 text-sm text-ink-muted">{p.description}</p>}
            <p className="mt-2 text-xs text-ink-muted">
              {p._count.workItems} {t("board.items")} · {p._count.teams} {t("settings.teams").toLowerCase()}
            </p>
          </li>
        ))}
      </ul>
      {canConfigure(user.role) && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">{t("settings.newProject")}</h2>
          <NewProjectForm />
        </section>
      )}
    </main>
  );
}
