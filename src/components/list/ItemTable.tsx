"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ItemView } from "@/lib/types";
import type { ColumnDef, InlineEditKind } from "@/lib/columns";
import type { SortSpec } from "@/lib/query";
import { isOverdue } from "@/lib/query";
import { allowedTargets } from "@/lib/workflow";
import { buildTree, type TreeRow } from "@/lib/tree";
import { formatDate, toDateInput } from "@/lib/format";
import { updateItem } from "@/server/actions/items";
import type { ItemPatch } from "@/server/workitems";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { useToast } from "../ui/Toast";
import { TypeIcon, StateDot } from "../ui/TypeIcon";
import { Avatar } from "../ui/Avatar";

export interface ItemTableProps {
  rows: ItemView[];
  /** All loaded items, used to add parent context rows in tree mode. */
  allItems: ItemView[];
  columns: ColumnDef[];
  mode: "flat" | "tree";
  sort: SortSpec[];
  onSort: (field: string) => void;
  openId: number | null;
  onOpen: (id: number) => void;
  onChanged: () => void;
  selection?: ReadonlySet<number>;
  onToggleRow?: (id: number) => void;
  onToggleAll?: () => void;
  /**
   * The scrolling container (passed as an element, not a ref, so the table re-renders once it exists);
   * when given, long tables only render the visible rows.
   */
  scrollElement?: HTMLElement | null;
}

const VIRTUAL_ROWS_FROM = 150;

export function ItemTable(props: ItemTableProps) {
  const { t, locale } = useI18n();
  const { typeById, queryContext, can } = useProject();
  const { user } = useSessionUser();
  const canEdit = can("items.edit") || can("items.assign") || can("items.changeState");
  // Which inline edits the role allows (own items count for "edit own"; the server checks again).
  const editAllowed = (kind: NonNullable<ColumnDef["edit"]>, it: ItemView) =>
    kind === "state" ? can("items.changeState") || can("items.close") : kind === "assignedTo" ? can("items.assign") : can("items.edit") || (it.createdById === user.id && can("items.editOwn"));
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [editing, setEditing] = useState<{ id: number; key: string } | null>(null);
  const qctx = useMemo(() => queryContext(user.id), [queryContext, user.id]);

  const treeRows: TreeRow[] = useMemo(
    () => (props.mode === "tree" ? buildTree(props.rows, props.allItems, collapsed) : props.rows.map((item) => ({ item, depth: 0, hasChildren: false, context: false }))),
    [props.mode, props.rows, props.allItems, collapsed],
  );
  // Decide on the prop being passed (even while the element is still null during SSR/hydration),
  // so the first HTML only contains the top rows instead of the whole table.
  const virtual = props.scrollElement !== undefined && treeRows.length >= VIRTUAL_ROWS_FROM;
  const virtualizer = useVirtualizer({
    count: virtual ? treeRows.length : 0,
    getScrollElement: () => props.scrollElement ?? null,
    estimateSize: () => 44,
    initialRect: { width: 1200, height: 1000 },
    overscan: 15,
    getItemKey: (i) => treeRows[i]?.item.id ?? i,
  });
  const vItems = virtual ? virtualizer.getVirtualItems() : [];
  const visibleRows = virtual ? vItems.map((v) => ({ row: treeRows[v.index], index: v.index })) : treeRows.map((row, index) => ({ row, index }));
  const padTop = virtual && vItems.length ? vItems[0].start : 0;
  const padBottom = virtual && vItems.length ? virtualizer.getTotalSize() - vItems[vItems.length - 1].end : 0;
  const colCount = props.columns.length + (props.selection && canEdit ? 1 : 0);
  const selectable = !!props.selection && canEdit;
  const selectedShown = selectable ? props.rows.filter((r) => props.selection!.has(r.id)).length : 0;
  const allSelected = props.rows.length > 0 && selectedShown === props.rows.length;

  const toggleCollapse = (id: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--color-line)]">
        <tr>
          {selectable && (
            <th scope="col" className="w-8 px-2 py-2">
              <input
                type="checkbox"
                aria-label={t("bulk.selectAll")}
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = selectedShown > 0 && !allSelected;
                }}
                onChange={props.onToggleAll}
              />
            </th>
          )}
          {props.columns.map((c) => {
            const active = props.sort[0]?.field === c.sort;
            return (
              <th key={c.key} scope="col" aria-sort={active ? (props.sort[0].dir === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-ink-muted">
                <button type="button" className="hover:text-ink" onClick={() => props.onSort(c.sort)}>
                  {columnLabel(c, t, locale)} {active ? (props.sort[0].dir === "asc" ? "▲" : "▼") : ""}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {padTop > 0 && (
          <tr aria-hidden="true">
            <td colSpan={colCount} style={{ height: padTop, padding: 0 }} />
          </tr>
        )}
        {visibleRows.map(({ row: { item: it, depth, hasChildren, context }, index }) => {
          const selected = props.selection?.has(it.id) ?? false;
          return (
            <tr
              key={it.id}
              data-index={index}
              ref={virtual ? virtualizer.measureElement : undefined}
              className={`border-b border-line hover:bg-brand-soft/40 ${props.openId === it.id || selected ? "bg-brand-soft" : "bg-white"} ${context ? "text-ink-muted" : ""}`}
            >
              {selectable && (
                <td className="px-2 py-1.5">
                  {!context && <input type="checkbox" aria-label={t("bulk.selectRow", { id: it.id })} checked={selected} onChange={() => props.onToggleRow?.(it.id)} />}
                </td>
              )}
              {props.columns.map((c) => {
                const isEditing = editing?.id === it.id && editing.key === c.key;
                const editable = !!c.edit && editAllowed(c.edit, it) && !(c.edit === "severity" && typeById.get(it.typeId)?.key !== "DEFECT");
                if (isEditing && c.edit) {
                  return (
                    <td key={c.key} className="px-1 py-0.5">
                      <InlineEditor item={it} kind={c.edit} onDone={(changed) => {
                        setEditing(null);
                        if (changed) props.onChanged();
                      }} />
                    </td>
                  );
                }
                const content = <CellContent col={c} item={it} overdue={c.key === "dueDate" && isOverdue(it, qctx)} onOpen={props.onOpen} />;
                const indent =
                  c.key === "title" && props.mode === "tree" ? (
                    <span className="inline-flex shrink-0 items-center" style={{ paddingLeft: depth * 18 }}>
                      {hasChildren ? (
                        <button type="button" className="mr-1 w-4 text-ink-muted" aria-expanded={!collapsed.has(it.id)} aria-label={`#${it.id}`} onClick={() => toggleCollapse(it.id)}>
                          {collapsed.has(it.id) ? "▸" : "▾"}
                        </button>
                      ) : (
                        <span className="mr-1 inline-block w-4" />
                      )}
                    </span>
                  ) : null;
                return (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 ${c.key === "title" ? "min-w-[16rem] max-w-xl" : "whitespace-nowrap"} ${editable ? "cursor-text hover:outline hover:outline-1 hover:outline-line-strong" : ""}`}
                    tabIndex={editable ? 0 : undefined}
                    title={editable ? t("list.inlineEditHint") : undefined}
                    onDoubleClick={editable ? () => setEditing({ id: it.id, key: c.key }) : undefined}
                    onKeyDown={
                      editable
                        ? (e) => {
                            if (e.target === e.currentTarget && (e.key === "F2" || e.key === "Enter")) {
                              e.preventDefault();
                              setEditing({ id: it.id, key: c.key });
                            }
                          }
                        : undefined
                    }
                  >
                    {indent ? (
                      <span className="flex items-center">
                        {indent}
                        {content}
                      </span>
                    ) : (
                      content
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
        {padBottom > 0 && (
          <tr aria-hidden="true">
            <td colSpan={colCount} style={{ height: padBottom, padding: 0 }} />
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function columnLabel(c: ColumnDef, t: (k: NonNullable<ColumnDef["labelKey"]>) => string, locale: string): string {
  if (c.labelKey) return t(c.labelKey);
  return (locale === "nb" && c.labelNb) || c.label || c.key;
}

function CellContent({ col, item, overdue, onOpen }: { col: ColumnDef; item: ItemView; overdue: boolean; onOpen: (id: number) => void }): ReactNode {
  const { t, locale } = useI18n();
  const { typeById, userById, moduleById, phaseById } = useProject();
  switch (col.key) {
    case "id":
      return <span className="font-semibold text-ink-muted">{item.id}</span>;
    case "type": {
      const type = typeById.get(item.typeId);
      return (
        <span className="flex items-center gap-1.5">
          <TypeIcon type={type} size={14} />
          {type?.name}
        </span>
      );
    }
    case "title":
      return (
        <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(item.id)}>
          {item.title}
        </button>
      );
    case "state": {
      const st = typeById.get(item.typeId)?.states.find((s) => s.name === item.state);
      return (
        <span className="flex items-center gap-1.5">
          <StateDot color={st?.color ?? "#999"} />
          {item.state}
        </span>
      );
    }
    case "assignedTo": {
      const u = item.assignedToId ? userById.get(item.assignedToId) : undefined;
      return (
        <span className="flex items-center gap-1.5">
          <Avatar user={u} size={20} />
          {u?.name ?? <span className="text-ink-muted">{t("common.unassigned")}</span>}
        </span>
      );
    }
    case "module":
      return item.moduleId ? moduleById.get(item.moduleId)?.path : "";
    case "phase":
      return item.phaseId ? phaseById.get(item.phaseId)?.name : "";
    case "createdBy":
      return userById.get(item.createdById)?.name ?? "";
    case "parent":
      return item.parentId ? (
        <button type="button" className="hover:underline" onClick={() => onOpen(item.parentId!)}>
          #{item.parentId}
        </button>
      ) : (
        ""
      );
    case "tags":
      return (
        <span className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span key={tag} className="rounded bg-gray-100 px-1.5 text-xs">
              {tag}
            </span>
          ))}
        </span>
      );
    default: {
      if (col.isDate) {
        const v = col.value(item, NO_NAMES);
        return <span className={overdue ? "font-semibold text-danger" : col.key === "changedAt" || col.key === "createdAt" ? "text-ink-muted" : ""}>{formatDate(typeof v === "string" ? v : null, locale)}</span>;
      }
      return col.value(item, NO_NAMES) ?? "";
    }
  }
}

// Columns rendered through the default branch never need name lookups.
const NO_NAMES = { typeName: () => "", userName: () => "", modulePath: () => "", phaseName: () => "", category: () => "" };

function InlineEditor({ item, kind, onDone }: { item: ItemView; kind: InlineEditKind; onDone: (changed: boolean) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { meta, typeById } = useProject();
  const [saving, setSaving] = useState(false);
  const done = useRef(false);
  const type = typeById.get(item.typeId);

  const save = async (patch: ItemPatch) => {
    if (done.current) return;
    done.current = true;
    setSaving(true);
    const res = await updateItem(item.id, patch);
    setSaving(false);
    if (!res.ok) {
      toast(res.error, "error");
      onDone(false);
      return;
    }
    onDone(res.data.length > 0);
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onDone(false);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };
  const cls = "w-full rounded border border-brand bg-white px-1.5 py-1 text-sm";
  const label = t("list.inlineEdit", { id: item.id });

  if (kind === "title" || kind === "dueDate") {
    const initial = kind === "title" ? item.title : toDateInput(item.dueDate);
    return (
      <input
        autoFocus
        aria-label={label}
        type={kind === "dueDate" ? "date" : "text"}
        className={cls}
        defaultValue={initial}
        disabled={saving}
        maxLength={255}
        onKeyDown={(e) => {
          keys(e);
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === initial) return cancel();
          if (kind === "title") return v ? save({ title: v }) : cancel();
          return save({ dueDate: v || null });
        }}
      />
    );
  }

  let options: { value: string; label: string }[] = [];
  let current = "";
  let toPatch: (v: string) => ItemPatch;
  switch (kind) {
    case "state":
      options = (type ? [item.state, ...allowedTargets({ states: type.states, transitions: type.transitions }, item.state)] : [item.state]).map((s) => ({ value: s, label: s }));
      current = item.state;
      toPatch = (v) => ({ state: v });
      break;
    case "assignedTo":
      options = [{ value: "", label: t("common.unassigned") }, ...meta.users.map((u) => ({ value: u.id, label: u.name }))];
      current = item.assignedToId ?? "";
      toPatch = (v) => ({ assignedToId: v || null });
      break;
    case "priority":
    case "severity":
      options = [...(kind === "severity" ? [{ value: "", label: "—" }] : []), ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))];
      current = String((kind === "priority" ? item.priority : item.severity) ?? "");
      toPatch = (v) => (kind === "priority" ? { priority: Number(v) } : { severity: v ? Number(v) : null });
      break;
    case "phase":
      options = [{ value: "", label: t("common.none") }, ...meta.phases.map((p) => ({ value: p.id, label: p.name }))];
      current = item.phaseId ?? "";
      toPatch = (v) => ({ phaseId: v || null });
      break;
    case "module":
      options = [{ value: "", label: t("common.none") }, ...meta.modules.map((m) => ({ value: m.id, label: m.path }))];
      current = item.moduleId ?? "";
      toPatch = (v) => ({ moduleId: v || null });
      break;
  }
  return (
    <select
      autoFocus
      aria-label={label}
      className={cls}
      defaultValue={current}
      disabled={saving}
      onKeyDown={keys}
      onChange={(e) => (e.target.value === current ? cancel() : save(toPatch(e.target.value)))}
      onBlur={cancel}
    >
      {[...new Map(options.map((o) => [o.value, o])).values()].map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
