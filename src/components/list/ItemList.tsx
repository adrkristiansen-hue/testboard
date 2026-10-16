"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ItemView } from "@/lib/types";
import { filterToParams, filterToQuery, isFilterActive, type FilterState } from "@/lib/filters";
import { isOverdue, runQuery, sortItems, type SortSpec } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import type { NewItemDefaults } from "@/lib/prefill";
import { formatDate } from "@/lib/format";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { FilterBar } from "../board/FilterBar";
import { ItemPanel } from "../item/ItemPanel";
import { TypeIcon, StateDot } from "../ui/TypeIcon";
import { Avatar } from "../ui/Avatar";
import { BulkBar } from "./BulkBar";
import { BulkCreateDialog } from "./BulkCreateDialog";

const COLUMNS: { key: string; label: MessageKey; sort: string }[] = [
  { key: "id", label: "field.id", sort: "id" },
  { key: "type", label: "field.type", sort: "type" },
  { key: "title", label: "field.title", sort: "title" },
  { key: "state", label: "field.state", sort: "state" },
  { key: "assignedTo", label: "field.assignedTo", sort: "assignedTo" },
  { key: "module", label: "field.module", sort: "module" },
  { key: "phase", label: "field.phase", sort: "phase" },
  { key: "priority", label: "field.priority", sort: "priority" },
  { key: "severity", label: "field.severity", sort: "severity" },
  { key: "dueDate", label: "field.dueDate", sort: "dueDate" },
  { key: "changedAt", label: "field.changedAt", sort: "changedAt" },
];

export function ItemList({ items, initialFilter, initialOpenId }: { items: ItemView[]; initialFilter: FilterState; initialOpenId: number | null }) {
  const { t, locale } = useI18n();
  const { typeById, userById, moduleById, phaseById, queryContext } = useProject();
  const { user, canEdit, canConfigure } = useSessionUser();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState(initialFilter);
  const [sort, setSort] = useState<SortSpec[]>([{ field: "id", dir: "desc" }]);
  const [openId, setOpenId] = useState<number | null>(initialOpenId);
  const [newDefaults, setNewDefaults] = useState<NewItemDefaults | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Set<number>>(() => new Set());
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);

  useEffect(() => {
    const p = filterToParams(filter);
    if (openId) p.set("item", String(openId));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filter, openId]);

  const qctx = useMemo(() => queryContext(user.id), [queryContext, user.id]);
  const rows = useMemo(() => {
    const filtered = isFilterActive(filter) ? runQuery(items, filterToQuery(filter), qctx) : items;
    return sortItems(filtered, sort, qctx);
  }, [items, filter, sort, qctx]);
  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  // Only rows that are currently shown count as selected, so hidden rows are never bulk-edited by accident.
  const selectedRows = useMemo(() => rows.filter((r) => selection.has(r.id)), [rows, selection]);
  const allShownSelected = rows.length > 0 && selectedRows.length === rows.length;
  const toggleRow = (id: number) =>
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSelection(allShownSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const toggleSort = (field: string) => setSort((s) => (s[0]?.field === field ? [{ field, dir: s[0].dir === "asc" ? "desc" : "asc" }] : [{ field, dir: "asc" }]));

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
            <FilterBar value={filter} onChange={setFilter} allTags={allTags} shown={rows.length} total={items.length} searchRef={searchRef} />
          </div>
        </div>
        {canEdit && selectedRows.length > 0 && <BulkBar selected={selectedRows} onClear={() => setSelection(new Set())} onDone={refresh} />}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--color-line)]">
              <tr>
                {canEdit && (
                  <th scope="col" className="w-8 px-2 py-2">
                    <input type="checkbox" aria-label={t("bulk.selectAll")} checked={allShownSelected} ref={(el) => {
                      if (el) el.indeterminate = selectedRows.length > 0 && !allShownSelected;
                    }} onChange={toggleAll} />
                  </th>
                )}
                {COLUMNS.map((c) => {
                  const active = sort[0]?.field === c.sort;
                  return (
                    <th key={c.key} scope="col" aria-sort={active ? (sort[0].dir === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-ink-muted">
                      <button type="button" className="hover:text-ink" onClick={() => toggleSort(c.sort)}>
                        {t(c.label)} {active ? (sort[0].dir === "asc" ? "▲" : "▼") : ""}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const type = typeById.get(it.typeId);
                const st = type?.states.find((s) => s.name === it.state);
                const assignee = it.assignedToId ? userById.get(it.assignedToId) : undefined;
                const overdue = isOverdue(it, qctx);
                return (
                  <tr key={it.id} className={`border-b border-line bg-white hover:bg-brand-soft/40 ${openId === it.id || selection.has(it.id) ? "bg-brand-soft" : ""}`}>
                    {canEdit && (
                      <td className="px-2 py-1.5">
                        <input type="checkbox" aria-label={t("bulk.selectRow", { id: it.id })} checked={selection.has(it.id)} onChange={() => toggleRow(it.id)} />
                      </td>
                    )}
                    <td className="px-2 py-1.5 font-semibold text-ink-muted">{it.id}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <TypeIcon type={type} size={14} />
                        {type?.name}
                      </span>
                    </td>
                    <td className="max-w-md px-2 py-1.5">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => { setNewDefaults(null); setOpenId(it.id); }}>
                        {it.title}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <StateDot color={st?.color ?? "#999"} />
                        {it.state}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <Avatar user={assignee} size={20} />
                        {assignee?.name ?? <span className="text-ink-muted">{t("common.unassigned")}</span>}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{it.moduleId ? moduleById.get(it.moduleId)?.path : ""}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{it.phaseId ? phaseById.get(it.phaseId)?.name : ""}</td>
                    <td className="px-2 py-1.5">{it.priority}</td>
                    <td className="px-2 py-1.5">{it.severity ?? ""}</td>
                    <td className={`whitespace-nowrap px-2 py-1.5 ${overdue ? "font-semibold text-danger" : ""}`}>{formatDate(it.dueDate, locale)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-muted">{formatDate(it.changedAt, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
