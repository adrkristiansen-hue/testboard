"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ItemView, SavedQueryView } from "@/lib/types";
import { filterToParams, filterToQuery, isFilterActive, type FilterState } from "@/lib/filters";
import { runQuery, sortItems, type SortSpec } from "@/lib/query";
import { columnCatalogue, columnsToParam, DEFAULT_COLUMNS, resolveColumns } from "@/lib/columns";
import type { NewItemDefaults } from "@/lib/prefill";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { FilterBar } from "../board/FilterBar";
import { ItemPanel } from "../item/ItemPanel";
import { BulkBar } from "./BulkBar";
import { BulkCreateDialog } from "./BulkCreateDialog";
import { ItemTable } from "./ItemTable";
import { ColumnChooser } from "./ColumnChooser";
import { ExportMenu } from "./ExportMenu";
import { useShortcuts } from "../useShortcuts";

const colsStorageKey = (projectId: string) => `tb.listColumns.${projectId}`;

export function ItemList({
  items,
  savedQueries,
  initialFilter,
  initialOpenId,
  initialColumns,
  initialMode,
}: {
  items: ItemView[];
  savedQueries: SavedQueryView[];
  initialFilter: FilterState;
  initialOpenId: number | null;
  initialColumns?: string[];
  initialMode: "flat" | "tree";
}) {
  const { t } = useI18n();
  const { meta, queryContext } = useProject();
  const { user, canEdit, canConfigure } = useSessionUser();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState(initialFilter);
  const [sort, setSort] = useState<SortSpec[]>([{ field: "id", dir: "desc" }]);
  const [openId, setOpenId] = useState<number | null>(initialOpenId);
  const [newDefaults, setNewDefaults] = useState<NewItemDefaults | null>(null);
  const [columnKeys, setColumnKeys] = useState<string[]>(initialColumns ?? DEFAULT_COLUMNS);
  const [mode, setMode] = useState<"flat" | "tree">(initialMode);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tableScrollEl, setTableScrollEl] = useState<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<Set<number>>(() => new Set());
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);

  // Columns: URL wins, otherwise the last choice in this browser.
  useEffect(() => {
    if (initialColumns) return;
    try {
      const stored = localStorage.getItem(colsStorageKey(meta.id));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage after hydration
      if (stored) setColumnKeys(JSON.parse(stored));
    } catch {
      /* storage unavailable */
    }
  }, [initialColumns, meta.id]);

  const changeColumns = (keys: string[]) => {
    setColumnKeys(keys);
    try {
      localStorage.setItem(colsStorageKey(meta.id), JSON.stringify(keys));
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    const p = filterToParams(filter);
    if (mode === "tree") p.set("view", "tree");
    if (columnKeys.join(",") !== DEFAULT_COLUMNS.join(",")) p.set("cols", columnsToParam(columnKeys));
    if (openId) p.set("item", String(openId));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filter, openId, mode, columnKeys]);

  const catalogue = useMemo(() => columnCatalogue(meta), [meta]);
  const columns = useMemo(() => resolveColumns(columnKeys, catalogue), [columnKeys, catalogue]);
  const qctx = useMemo(() => queryContext(user.id), [queryContext, user.id]);
  const savedById = useMemo(() => new Map(savedQueries.map((q) => [q.id, q.definition])), [savedQueries]);
  const rows = useMemo(() => {
    const filtered = isFilterActive(filter) ? runQuery(items, filterToQuery(filter, (id) => savedById.get(id)), qctx) : items;
    return sortItems(filtered, sort, qctx);
  }, [items, filter, sort, qctx, savedById]);
  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  // Only rows that are currently shown count as selected, so hidden rows are never bulk-edited by accident.
  const selectedRows = useMemo(() => rows.filter((r) => selection.has(r.id)), [rows, selection]);
  const toggleRow = (id: number) =>
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSelection(selectedRows.length === rows.length ? new Set() : new Set(rows.map((r) => r.id)));
  useShortcuts({
    "/": () => searchRef.current?.focus(),
    n: () => {
      if (!canEdit) return;
      setOpenId(null);
      setNewDefaults({});
    },
  });
  const toggleSort = (field: string) => setSort((s) => (s[0]?.field === field ? [{ field, dir: s[0].dir === "asc" ? "desc" : "asc" }] : [{ field, dir: "asc" }]));

  // "Save as query" carries the current filter, sort and columns to the query editor.
  const saveAsQueryHref = useMemo(() => {
    const def = { ...filterToQuery({ ...filter, query: "" }), sort };
    const base = filter.query ? savedById.get(filter.query) : undefined;
    if (base) def.root = { logic: "and", clauses: [base.root, ...def.root.clauses] };
    const p = new URLSearchParams({ def: JSON.stringify(def), cols: columnKeys.join(","), mode: mode === "tree" ? "TREE" : "FLAT" });
    return `/p/${meta.id}/queries/new?${p}`;
  }, [filter, sort, columnKeys, mode, meta.id, savedById]);

  const modeBtn = (m: "flat" | "tree") => `px-2 py-1 text-sm ${mode === m ? "bg-brand-soft font-semibold text-brand-dark" : "bg-white hover:bg-gray-50"}`;

  return (
    <div className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2">
          <h1 className="mr-2 font-semibold">{t("list.title")}</h1>
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setOpenId(null); setNewDefaults({}); }}>
              + {t("item.new")}
            </button>
          )}
          {canConfigure && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBulkCreateOpen(true)}>
              {t("bulkCreate.open")}
            </button>
          )}
          <div className="w-full lg:w-auto lg:flex-1">
            <FilterBar value={filter} onChange={setFilter} allTags={allTags} shown={rows.length} total={items.length} searchRef={searchRef} savedQueries={savedQueries} />
          </div>
          <div className="flex items-center gap-1">
            <div role="group" aria-label={t("query.mode")} className="flex overflow-hidden rounded border border-line-strong">
              <button type="button" className={modeBtn("flat")} aria-pressed={mode === "flat"} onClick={() => setMode("flat")}>
                {t("list.flat")}
              </button>
              <button type="button" className={modeBtn("tree")} aria-pressed={mode === "tree"} onClick={() => setMode("tree")}>
                {t("list.tree")}
              </button>
            </div>
            <ColumnChooser catalogue={catalogue} value={columnKeys} onChange={changeColumns} />
            <ExportMenu ids={rows.map((r) => r.id)} columns={columns.map((c) => c.key)} />
            <Link href={saveAsQueryHref} className="btn btn-ghost btn-sm">
              {t("list.saveAsQuery")}
            </Link>
          </div>
        </div>
        {canEdit && selectedRows.length > 0 && <BulkBar selected={selectedRows} onClear={() => setSelection(new Set())} onDone={refresh} />}
        <div ref={setTableScrollEl} className="min-h-0 flex-1 overflow-auto">
          <ItemTable
            scrollElement={tableScrollEl}
            rows={rows}
            allItems={items}
            columns={columns}
            mode={mode}
            sort={sort}
            onSort={toggleSort}
            openId={openId}
            onOpen={(id) => { setNewDefaults(null); setOpenId(id); }}
            onChanged={refresh}
            selection={selection}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
          />
          {rows.length === 0 && <p className="p-6 text-center text-ink-muted">{t("list.empty")}</p>}
        </div>
      </main>
      {bulkCreateOpen && <BulkCreateDialog items={items} onClose={() => setBulkCreateOpen(false)} onCreated={refresh} />}
      {(openId !== null || newDefaults) && (
        <ItemPanel
          key={openId ?? "new"}
          itemId={openId}
          newDefaults={newDefaults ?? undefined}
          onClose={() => { setOpenId(null); setNewDefaults(null); }}
          onSaved={refresh}
          onCreated={(id) => { setNewDefaults(null); setOpenId(id); }}
          onOpenItem={(id) => { setNewDefaults(null); setOpenId(id); }}
          onNewItem={(d) => { setOpenId(null); setNewDefaults(d); }}
        />
      )}
    </div>
  );
}
