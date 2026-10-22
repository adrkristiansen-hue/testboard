"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import type { ItemView, SavedQueryView } from "@/lib/types";
import { QUERY_FIELDS, runQuery, type Group, type SortSpec } from "@/lib/query";
import { columnCatalogue, resolveColumns } from "@/lib/columns";
import { deleteQuery, saveQuery } from "@/server/actions/queries";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { useToast } from "../ui/Toast";
import { ConditionEditor } from "./ConditionEditor";
import { ItemTable, columnLabel } from "../list/ItemTable";
import { ColumnChooser } from "../list/ColumnChooser";
import { ExportMenu } from "../list/ExportMenu";
import { ItemPanel } from "../item/ItemPanel";

const MAX_SORT = 3;

export function QueryEditor({ query, isNew, items }: { query: SavedQueryView; isNew: boolean; items: ItemView[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { meta, queryContext, can } = useProject();
  const { user } = useSessionUser();
  const canConfigure = can("queries.share");

  const [name, setName] = useState(query.name);
  const [shared, setShared] = useState(query.shared);
  const [mode, setMode] = useState(query.mode);
  const [root, setRoot] = useState<Group>(query.definition.root);
  const [sort, setSort] = useState<SortSpec[]>(query.definition.sort?.length ? query.definition.sort : [{ field: "id", dir: "asc" }]);
  const [columnKeys, setColumnKeys] = useState(query.columns);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [tableScrollEl, setTableScrollEl] = useState<HTMLDivElement | null>(null);

  const canSave = isNew || query.ownerId === user.id || (query.shared && canConfigure);
  const catalogue = useMemo(() => columnCatalogue(meta), [meta]);
  const columns = useMemo(() => resolveColumns(columnKeys, catalogue), [columnKeys, catalogue]);
  const qctx = useMemo(() => queryContext(user.id), [queryContext, user.id]);
  const rows = useMemo(() => runQuery(items, { root, sort }, qctx), [items, root, sort, qctx]);
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const current = JSON.stringify({ name, shared, mode, root, sort, columnKeys });
  const [savedState, setSavedState] = useState(current);
  const dirty = current !== savedState;

  const persist = async (asNew: boolean) => {
    const finalName = asNew && !isNew ? `${name} (${t("query.copy")})` : name.trim();
    if (!finalName) return toast(t("query.nameRequired"), "error");
    setBusy(true);
    const res = await saveQuery({
      id: asNew || isNew ? undefined : query.id,
      projectId: meta.id,
      name: finalName,
      shared: asNew && !canConfigure ? false : shared,
      mode,
      definition: { root, sort },
      columns: columnKeys,
    });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast(t("query.saved"), "success");
    setSavedState(current);
    if (asNew || isNew) router.push(`/p/${meta.id}/queries/${res.data.id}`);
    else refresh();
  };

  const remove = async () => {
    if (!confirm(t("common.confirmDelete"))) return;
    const res = await deleteQuery(query.id);
    if (!res.ok) return toast(res.error, "error");
    router.push(`/p/${meta.id}/queries`);
  };

  const sortFields = useMemo(
    () => [...new Set([...catalogue.map((c) => c.sort), ...Object.keys(QUERY_FIELDS)])].filter((f) => f !== "keyword" && f !== "overdue"),
    [catalogue],
  );
  const sortLabel = (f: string) => {
    const col = catalogue.find((c) => c.sort === f);
    return col ? columnLabel(col, t, locale) : f;
  };

  return (
    <div className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="border-b border-line bg-white px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link href={`/p/${meta.id}/queries`} className="text-sm text-brand hover:underline">
              ← {t("nav.queries")}
            </Link>
            <h1 className="sr-only">{isNew ? t("query.new") : `${t("nav.queries")}: ${query.name}`}</h1>
            <label htmlFor="q-name" className="sr-only">
              {t("common.name")}
            </label>
            <input id="q-name" className="input max-w-md text-lg font-semibold" placeholder={t("query.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} readOnly={!canSave} />
            {dirty && <span className="text-xs text-ink-muted">{t("query.unsaved")}</span>}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canSave && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || (!dirty && !isNew)} onClick={() => persist(false)}>
                  {t("common.save")}
                </button>
              )}
              {!isNew && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => persist(true)}>
                  {t("query.saveAs")}
                </button>
              )}
              {!isNew && (
                <Link href={`/p/${meta.id}/boards?query=${query.id}`} className="btn btn-ghost btn-sm">
                  {t("query.useOnBoard")}
                </Link>
              )}
              {!isNew && canSave && (
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={remove}>
                  {t("common.delete")}
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <fieldset className="flex items-center gap-3">
              <legend className="sr-only">{t("query.mode")}</legend>
              <span className="font-semibold">{t("query.mode")}:</span>
              {(["FLAT", "TREE"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1">
                  <input type="radio" name="q-mode" checked={mode === m} onChange={() => setMode(m)} disabled={!canSave} />
                  {m === "TREE" ? t("query.tree") : t("query.flat")}
                </label>
              ))}
            </fieldset>
            {canConfigure && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} disabled={!canSave} />
                {t("query.sharedLabel")}
              </label>
            )}
          </div>
        </div>

        <section aria-labelledby="q-cond" className="border-b border-line bg-white px-4 py-3">
          <h2 id="q-cond" className="mb-2 text-sm font-semibold">
            {t("query.conditions")}
          </h2>
          <ConditionEditor value={root} onChange={setRoot} />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{t("query.sort")}:</span>
            {sort.map((s, i) => (
              <span key={i} className="flex items-center gap-1 rounded border border-line px-1 py-0.5">
                <select aria-label={`${t("query.sort")} ${i + 1}`} className="bg-transparent" value={s.field} onChange={(e) => setSort(sort.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}>
                  {sortFields.map((f) => (
                    <option key={f} value={f}>
                      {sortLabel(f)}
                    </option>
                  ))}
                </select>
                <select aria-label={t("query.direction")} className="bg-transparent" value={s.dir} onChange={(e) => setSort(sort.map((x, j) => (j === i ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))}>
                  <option value="asc">{t("query.ascending")}</option>
                  <option value="desc">{t("query.descending")}</option>
                </select>
                {sort.length > 1 && (
                  <button type="button" className="icon-btn h-6 w-6" aria-label={t("common.remove")} onClick={() => setSort(sort.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                )}
              </span>
            ))}
            {sort.length < MAX_SORT && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSort([...sort, { field: "priority", dir: "asc" }])}>
                + {t("query.addSort")}
              </button>
            )}
          </div>
        </section>

        <section aria-labelledby="q-results" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-4 py-2">
            <h2 id="q-results" className="text-sm font-semibold" aria-live="polite">
              {t("query.results", { count: rows.length })}
            </h2>
            <div className="ml-auto flex items-center gap-1">
              <ColumnChooser catalogue={catalogue} value={columnKeys} onChange={setColumnKeys} />
              <ExportMenu ids={rows.map((r) => r.id)} columns={columns.map((c) => c.key)} name={name || undefined} />
            </div>
          </div>
          <div ref={setTableScrollEl} className="min-h-0 flex-1 overflow-auto border-t border-line">
            <ItemTable
            scrollElement={tableScrollEl}
              rows={rows}
              allItems={items}
              columns={columns}
              mode={mode === "TREE" ? "tree" : "flat"}
              sort={sort}
              onSort={(field) => setSort((s) => (s[0]?.field === field ? [{ field, dir: s[0].dir === "asc" ? "desc" : "asc" }, ...s.slice(1)] : [{ field, dir: "asc" }]))}
              openId={openId}
              onOpen={setOpenId}
              onChanged={refresh}
            />
            {rows.length === 0 && <p className="p-6 text-center text-ink-muted">{t("list.empty")}</p>}
          </div>
        </section>
      </main>
      {openId !== null && (
        <ItemPanel key={openId} itemId={openId} onClose={() => setOpenId(null)} onSaved={refresh} onOpenItem={setOpenId} onNewItem={() => router.push(`/p/${meta.id}/items`)} />
      )}
    </div>
  );
}
