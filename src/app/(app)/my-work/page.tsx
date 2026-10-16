import Link from "next/link";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { loadMyWork, type MyWorkRow } from "@/server/mywork";
import { STATE_CATEGORIES } from "@/lib/workflow";
import { formatDate, formatRelative } from "@/lib/format";
import type { Locale, TFunction } from "@/lib/i18n";
import { TypeIcon, StateDot } from "@/components/ui/TypeIcon";
import { Avatar } from "@/components/ui/Avatar";

export const metadata = { title: "My work" };

type Tab = "assigned" | "mentioned" | "following";

function itemHref(r: MyWorkRow) {
  return `/p/${r.projectId}/items/${r.id}`;
}

function ItemRows({ rows, t, locale, now }: { rows: MyWorkRow[]; t: TFunction; locale: Locale; now: number }) {
  if (rows.length === 0) return <p className="px-3 py-4 text-sm text-ink-muted">{t("myWork.empty")}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const overdue = r.dueDate && new Date(r.dueDate).getTime() < now && r.category !== "COMPLETED" && r.category !== "REMOVED";
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <TypeIcon type={r.type} size={16} />
            <span className="w-24 shrink-0 text-xs font-semibold text-ink-muted">
              {r.projectKey} {r.id}
            </span>
            <Link href={itemHref(r)} className="min-w-0 flex-1 font-medium hover:underline">
              {r.title}
            </Link>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-ink-muted">
              <StateDot color={r.stateColor} />
              {r.state}
            </span>
            <span className="w-10 text-center text-xs text-ink-muted" title={t("field.priority")}>
              P{r.priority}
            </span>
            <span className={`w-28 text-right text-xs ${overdue ? "font-semibold text-danger" : "text-ink-muted"}`} title={t("field.dueDate")}>
              {formatDate(r.dueDate, locale)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Group by state, ordered by state category (Proposed → In progress → Resolved → ...). */
function groupByState(rows: MyWorkRow[]) {
  const groups = new Map<string, MyWorkRow[]>();
  const sorted = [...rows].sort((a, b) => STATE_CATEGORIES.indexOf(a.category ?? "PROPOSED") - STATE_CATEGORIES.indexOf(b.category ?? "PROPOSED") || a.stateOrder - b.stateOrder);
  for (const r of sorted) {
    const g = groups.get(r.state) ?? [];
    g.push(r);
    groups.set(r.state, g);
  }
  return [...groups.entries()];
}

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ tab?: string; closed?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: Tab = sp.tab === "mentioned" || sp.tab === "following" ? sp.tab : "assigned";
  const includeClosed = sp.closed === "1";
  const { t, locale } = await getT();
  const data = await loadMyWork(user.id, { includeClosed });
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const now = Date.now();

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "assigned", label: t("myWork.assigned"), count: data.open.length },
    { key: "mentioned", label: t("myWork.mentioned"), count: data.mentions.length },
    { key: "following", label: t("myWork.following"), count: data.following.length },
  ];
  const qs = (p: { tab?: Tab; closed?: boolean }) => {
    const u = new URLSearchParams();
    const nt = p.tab ?? tab;
    if (nt !== "assigned") u.set("tab", nt);
    if (p.closed ?? includeClosed) u.set("closed", "1");
    const s = u.toString();
    return s ? `/my-work?${s}` : "/my-work";
  };

  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">{t("myWork.title")}</h1>
          <p className="text-sm text-ink-muted">{t("myWork.subtitle")}</p>
        </div>
        {tab !== "mentioned" && (
          <Link href={qs({ closed: !includeClosed })} className="flex items-center gap-2 text-sm" aria-pressed={includeClosed}>
            <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded border ${includeClosed ? "border-brand bg-brand text-white" : "border-line-strong bg-white"}`}>
              {includeClosed ? "✓" : ""}
            </span>
            {t("myWork.showClosed")}
          </Link>
        )}
      </div>
      <nav aria-label={t("myWork.title")} className="mb-3 flex gap-1 border-b border-line">
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={qs({ tab: x.key })}
            aria-current={tab === x.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === x.key ? "border-brand font-semibold text-brand-dark" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {x.label} <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-xs">{x.count}</span>
          </Link>
        ))}
      </nav>

      {tab === "assigned" && (
        <div className="space-y-3">
          {data.open.length === 0 && <p className="card-panel p-6 text-center text-ink-muted">{t("myWork.empty")}</p>}
          {groupByState(data.open).map(([state, rows]) => (
            <section key={state} className="card-panel" aria-labelledby={`grp-${state}`}>
              <h2 id={`grp-${state}`} className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm font-semibold">
                <StateDot color={rows[0].stateColor} />
                {state} <span className="font-normal text-ink-muted">({rows.length})</span>
              </h2>
              <ItemRows rows={rows} t={t} locale={locale} now={now} />
            </section>
          ))}
          {includeClosed && (
            <section className="card-panel" aria-labelledby="grp-closed">
              <h2 id="grp-closed" className="border-b border-line px-3 py-2 text-sm font-semibold">
                {t("category.COMPLETED")} / {t("category.REMOVED")} <span className="font-normal text-ink-muted">({data.closedCount})</span>
              </h2>
              <ItemRows rows={data.closed} t={t} locale={locale} now={now} />
            </section>
          )}
        </div>
      )}

      {tab === "mentioned" && (
        <section className="card-panel">
          {data.mentions.length === 0 ? (
            <p className="p-6 text-center text-ink-muted">{t("myWork.empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.mentions.map((m) => (
                <li key={m.commentId} className="flex gap-3 px-3 py-2.5 text-sm">
                  <Avatar user={{ name: m.authorName, color: m.authorColor }} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-semibold">{t("myWork.mentionedBy", { name: m.authorName })}</span>
                      {m.viaTeam && <span className="rounded bg-gray-100 px-1.5 text-xs">@{m.viaTeam}</span>}
                      <span className="text-xs text-ink-muted">{formatRelative(m.createdAt, locale)}</span>
                    </div>
                    <Link href={itemHref(m.item)} className="flex items-center gap-1.5 hover:underline">
                      <TypeIcon type={m.item.type} size={14} />
                      <span className="text-ink-muted">{m.item.projectKey} {m.item.id}</span> {m.item.title}
                    </Link>
                    <p className="mt-0.5 text-ink-muted">{m.excerpt}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "following" && (
        <section className="card-panel">
          <ItemRows rows={data.following} t={t} locale={locale} now={now} />
        </section>
      )}
    </main>
  );
}
