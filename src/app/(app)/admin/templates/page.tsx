import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { parseTemplateContent, summarizeTemplate } from "@/server/template-build";
import { formatDate } from "@/lib/format";
import { AdminNav } from "@/components/settings/AdminNav";
import { DeleteTemplateButton } from "@/components/settings/DeleteTemplateButton";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  const { t, locale } = await getT();
  const rows = await db.processTemplate.findMany({ orderBy: { name: "asc" } });
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <AdminNav current="templates" />
      <h1 className="mb-1 text-lg font-semibold">{t("nav.templates")}</h1>
      <p className="mb-3 text-sm text-ink-muted">{t("template.adminHint")}</p>
      <ul className="space-y-2">
        {rows.map((r) => {
          let summary = "";
          try {
            summary = t("template.summary", summarizeTemplate(parseTemplateContent(r.content)));
          } catch {
            summary = t("template.invalid");
          }
          return (
            <li key={r.id} className="card-panel flex flex-wrap items-center gap-3 p-3">
              <div className="mr-auto">
                <div className="font-semibold">{r.name}</div>
                {r.description && <div className="text-sm text-ink-muted">{r.description}</div>}
                <div className="text-xs text-ink-muted">
                  {summary} · {formatDate(r.createdAt.toISOString(), locale)}
                </div>
              </div>
              <DeleteTemplateButton id={r.id} name={r.name} />
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="card-panel p-6 text-center text-ink-muted">{t("template.empty")}</p>}
    </main>
  );
}
