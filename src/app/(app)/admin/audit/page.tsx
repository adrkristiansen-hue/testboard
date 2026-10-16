import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { formatDateTime } from "@/lib/format";
import { AdminNav } from "@/components/settings/AdminNav";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string; actor?: string }> }) {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  const sp = await searchParams;
  const { t, locale } = await getT();
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    ...(sp.action ? { action: { startsWith: sp.action } } : {}),
    ...(sp.actor ? { actorId: sp.actor } : {}),
  };
  const [rows, total, actions, users] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const groups = [...new Set(actions.map((a) => a.action.split(".")[0]))];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const q = new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), ...(sp.actor ? { actor: sp.actor } : {}), page: String(p) });
    return `/admin/audit?${q}`;
  };

  return (
    <main className="mx-auto w-full max-w-6xl p-4">
      <AdminNav current="audit" />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-semibold">{t("nav.audit")}</h1>
        <form className="flex flex-wrap items-end gap-2 text-sm" action="/admin/audit">
          <label className="flex flex-col">
            <span className="label">{t("audit.action")}</span>
            <select name="action" defaultValue={sp.action ?? ""} className="input py-1">
              <option value="">{t("common.all")}</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  <option value={`${g}.`}>{g}.*</option>
                  {actions
                    .filter((a) => a.action.startsWith(`${g}.`))
                    .map((a) => (
                      <option key={a.action} value={a.action}>
                        {a.action}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="label">{t("audit.actor")}</span>
            <select name="actor" defaultValue={sp.actor ?? ""} className="input py-1">
              <option value="">{t("common.all")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-secondary btn-sm">
            {t("common.apply")}
          </button>
        </form>
      </div>
      <p className="mb-2 text-sm text-ink-muted">{t("audit.count", { count: total })}</p>
      <div className="card-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th scope="col" className="px-3 py-2 font-semibold">{t("audit.when")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("audit.actor")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("audit.action")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("audit.entity")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("audit.details")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-ink-muted">{formatDateTime(r.createdAt.toISOString(), locale)}</td>
                <td className="whitespace-nowrap px-3 py-1.5">{r.actor?.name ?? t("audit.system")}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{r.action}</td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  {r.entityType}
                  {r.entityId && <span className="ml-1 font-mono text-xs text-ink-muted">{r.entityId.length > 12 ? `${r.entityId.slice(0, 10)}…` : r.entityId}</span>}
                </td>
                <td className="max-w-md px-3 py-1.5">
                  {r.details && (
                    <details>
                      <summary className="cursor-pointer text-xs text-brand">{t("audit.show")}</summary>
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-xs">{prettify(r.details)}</pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-ink-muted">{t("audit.empty")}</p>}
      </div>
      {pages > 1 && (
        <nav aria-label={t("audit.pages")} className="mt-3 flex items-center gap-2 text-sm">
          {page > 1 && (
            <Link href={href(page - 1)} className="btn btn-ghost btn-sm">
              ← {t("audit.newer")}
            </Link>
          )}
          <span className="text-ink-muted">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link href={href(page + 1)} className="btn btn-ghost btn-sm">
              {t("audit.older")} →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}

function prettify(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
