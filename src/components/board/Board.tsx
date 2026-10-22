"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { ItemView, TeamLite, SavedQueryView } from "@/lib/types";
import { columnForItem, placeItems, resolveMove, sortColumns, wipStatus, orderBetween, type ColumnDef } from "@/lib/board";
import { buildLanes, groupByLane, laneKeyForItem, visibleLanes, type Lane, type LaneContext, type SwimlaneConfig } from "@/lib/swimlanes";
import { cardStyle, type CardConfig } from "@/lib/cards";
import { filterToParams, filterToQuery, isFilterActive, type FilterState } from "@/lib/filters";
import { isOverdue, runQuery } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import type { NewItemDefaults } from "@/lib/prefill";
import { createItem, moveCard, updateItem } from "@/server/actions/items";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { useToast } from "../ui/Toast";
import { Card, type CardActions } from "./Card";
import { CellList } from "./CellList";
import { FilterBar } from "./FilterBar";
import { NewBoardDialog } from "./NewBoardDialog";
import { useShortcuts } from "../useShortcuts";
import { ItemPanel } from "../item/ItemPanel";

export interface BoardProps {
  team: { id: string; name: string };
  teams: TeamLite[];
  columns: ColumnDef[];
  swimlanes: SwimlaneConfig;
  cardConfig: CardConfig;
  items: ItemView[];
  memberIds: string[];
  defaults: { moduleId: string | null; phaseId: string | null };
  initialFilter: FilterState;
  initialOpenId: number | null;
  savedQueries?: SavedQueryView[];
}

const cellKey = (lane: string, col: string, done: boolean) => `${lane}|${col}|${done ? 1 : 0}`;

function DraggableCard({ item, cell, disabled, children }: { item: ItemView; cell: string; disabled: boolean; children: (dragging: boolean) => ReactNode }) {
  const drag = useDraggable({ id: `card:${item.id}`, data: { itemId: item.id, cell }, disabled });
  const drop = useDroppable({ id: `over:${item.id}`, data: { itemId: item.id, cell } });
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      className={`touch-manipulation ${drop.isOver && !drag.isDragging ? "rounded shadow-[0_-3px_0_0_var(--color-brand)]" : ""}`}
    >
      {children(drag.isDragging)}
    </div>
  );
}

function DroppableCell({ id, wip, children }: { id: string; wip: "none" | "ok" | "at" | "over"; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${id}`, data: { cell: id } });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-16 rounded-sm transition-colors ${isOver ? "bg-brand-soft" : wip === "over" ? "bg-red-50" : "bg-[#eef0f3]"}`}
    >
      {children}
    </div>
  );
}

export function Board(props: BoardProps) {
  const { t, locale } = useI18n();
  const { meta, typeById, userById, moduleById, phaseById, queryContext, can } = useProject();
  const { user } = useSessionUser();
  // Moving cards needs "change state"; creating and configuring have their own permissions.
  const canEdit = can("items.changeState") || can("items.close");
  const canCreate = can("items.create");
  const canConfigure = can("boards.configure");
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local copy for optimistic updates; reset whenever the server sends fresh items.
  const [items, setItems] = useState(props.items);
  const [serverItems, setServerItems] = useState(props.items);
  if (props.items !== serverItems) {
    setServerItems(props.items);
    setItems(props.items);
  }

  const [filter, setFilter] = useState<FilterState>(props.initialFilter);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(props.initialOpenId);
  const [newDefaults, setNewDefaults] = useState<NewItemDefaults | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(props.swimlanes.collapsed ?? []));
  const [activeId, setActiveId] = useState<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keep filters and the open item in the URL so a view can be shared/reloaded.
  useEffect(() => {
    const p = filterToParams(filter);
    if (openId) p.set("item", String(openId));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filter, openId]);

  const columns = useMemo(() => sortColumns(props.columns), [props.columns]);
  const qctx = useMemo(() => queryContext(user.id), [queryContext, user.id]);
  const laneCtx: LaneContext = useMemo(
    () => ({
      modules: meta.modules,
      users: meta.users,
      query: qctx,
      labels: { unassigned: t("common.unassigned"), noModule: t("common.noModule"), default: t("common.default"), priority: (p) => t(`priority.${p}` as MessageKey) },
    }),
    [meta.modules, meta.users, qctx, t],
  );

  const savedQueries = props.savedQueries;
  const visible = useMemo(() => {
    if (!isFilterActive(filter)) return items;
    const saved = new Map((savedQueries ?? []).map((q) => [q.id, q.definition]));
    return runQuery(items, filterToQuery(filter, (id) => saved.get(id)), qctx);
  }, [items, filter, qctx, savedQueries]);
  const allLanes = useMemo(() => buildLanes(props.swimlanes, laneCtx), [props.swimlanes, laneCtx]);
  const grouped = useMemo(() => groupByLane(visible, props.swimlanes, laneCtx), [visible, props.swimlanes, laneCtx]);
  const memberSet = useMemo(() => new Set(props.memberIds), [props.memberIds]);
  const lanes = useMemo(() => visibleLanes(allLanes, grouped, props.swimlanes, memberSet), [allLanes, grouped, props.swimlanes, memberSet]);

  // Cells: laneKey|columnId|done -> ordered items
  const { cells, unmapped } = useMemo(() => {
    const map = new Map<string, ItemView[]>();
    let unmappedCount = 0;
    for (const lane of lanes) {
      const { byColumn, unmapped } = placeItems(grouped.get(lane.key) ?? [], columns);
      unmappedCount += unmapped.length;
      for (const c of columns) {
        const b = byColumn.get(c.id)!;
        map.set(cellKey(lane.key, c.id, false), b.doing);
        if (c.split) map.set(cellKey(lane.key, c.id, true), b.done);
      }
    }
    return { cells: map, unmapped: unmappedCount };
  }, [lanes, grouped, columns]);

  // WIP counts use all items on the board (filters do not change WIP).
  const columnCounts = useMemo(() => {
    const { byColumn } = placeItems(items, columns);
    return new Map(columns.map((c) => [c.id, (byColumn.get(c.id)?.doing.length ?? 0) + (byColumn.get(c.id)?.done.length ?? 0)]));
  }, [items, columns]);

  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b)), [items]);
  const teamUsers = useMemo(() => [...meta.users].sort((a, b) => Number(memberSet.has(b.id)) - Number(memberSet.has(a.id)) || a.name.localeCompare(b.name)), [meta.users, memberSet]);

  const errorText = useCallback((e: string) => (e.startsWith("board.") ? t(e as MessageKey) : e), [t]);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  /** Optimistically move a card, then persist. */
  const performMove = useCallback(
    (item: ItemView, column: ColumnDef, done: boolean, targetLaneKey: string | null, before?: number, after?: number) => {
      const type = typeById.get(item.typeId);
      if (!type) return;
      const res = resolveMove(item, column, type, done);
      if (!res.ok) {
        toast(t(res.reason === "NO_MAPPING" ? "board.noMapping" : "board.transitionNotAllowed"), "error");
        return;
      }
      const lane = targetLaneKey !== null ? lanes.find((l) => l.key === targetLaneKey) : undefined;
      const laneChange = lane?.assign && laneKeyForItem(item, props.swimlanes, laneCtx) !== lane.key ? lane.assign : undefined;
      const newOrder = before !== undefined || after !== undefined ? orderBetween(before, after) : item.boardOrder;
      const previous = items;
      setItems((list) =>
        list.map((i) =>
          i.id === item.id
            ? {
                ...i,
                state: res.state,
                columnDone: res.columnDone,
                boardOrder: newOrder,
                ...(laneChange ? { [laneChange.field]: laneChange.value } : {}),
              }
            : i,
        ),
      );
      void (async () => {
        const r = await moveCard({ id: item.id, columnId: column.id, done, before, after, lane: laneChange });
        if (!r.ok) {
          setItems(previous);
          toast(errorText(r.error), "error");
          return;
        }
        toast(t("board.moved", { id: item.id, column: column.split ? `${column.name} – ${done ? t("board.done") : t("board.doing")}` : column.name }));
        refresh();
      })();
    },
    [typeById, toast, t, lanes, props.swimlanes, laneCtx, items, errorText, refresh],
  );

  const locate = useCallback(
    (itemId: number): { cell: string; list: ItemView[]; index: number } | null => {
      for (const [cell, list] of cells) {
        const index = list.findIndex((i) => i.id === itemId);
        if (index >= 0) return { cell, list, index };
      }
      return null;
    },
    [cells],
  );

  const parseCell = (cell: string) => {
    const [lane, colId, done] = cell.split("|");
    return { lane, column: columns.find((c) => c.id === colId)!, done: done === "1" };
  };

  const actions: CardActions = useMemo(
    () => ({
      open: (id) => {
        returnFocus.current = document.activeElement as HTMLElement;
        setNewDefaults(null);
        setOpenId(id);
      },
      moveToColumn: (item, column, done) => {
        const lane = laneKeyForItem(item, props.swimlanes, laneCtx);
        const list = cells.get(cellKey(lane, column.id, column.split && done)) ?? [];
        const others = list.filter((i) => i.id !== item.id);
        performMove(item, column, done, null, undefined, others[0]?.boardOrder);
      },
      moveToLane: (item, lane) => {
        const col = columnForItem(item, columns);
        if (!col) return;
        performMove(item, col, item.columnDone, lane.key);
      },
      moveWithinCell: (item, where) => {
        const loc = locate(item.id);
        if (!loc) return;
        const { column, done } = parseCell(loc.cell);
        const others = loc.list.filter((i) => i.id !== item.id);
        let before: number | undefined;
        let after: number | undefined;
        if (where === "top") after = others[0]?.boardOrder;
        else if (where === "bottom") before = others.at(-1)?.boardOrder;
        else if (where === "up") {
          const target = Math.max(0, loc.index - 1);
          before = others[target - 1]?.boardOrder;
          after = others[target]?.boardOrder;
        } else {
          const target = Math.min(others.length, loc.index + 1);
          before = others[target - 1]?.boardOrder;
          after = others[target]?.boardOrder;
        }
        if (before === undefined && after === undefined) return;
        performMove(item, column, done, null, before, after);
      },
      assign: (item, userId) => {
        const previous = items;
        setItems((list) => list.map((i) => (i.id === item.id ? { ...i, assignedToId: userId } : i)));
        void (async () => {
          const r = await updateItem(item.id, { assignedToId: userId });
          if (!r.ok) {
            setItems(previous);
            return toast(r.error, "error");
          }
          refresh();
        })();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, columns, performMove, locate, items, props.swimlanes, laneCtx, refresh, toast],
  );

  // Drag and drop
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const collision: CollisionDetection = useCallback((args) => {
    const hits = pointerWithin(args);
    const card = hits.find((h) => String(h.id).startsWith("over:"));
    if (card) return [card];
    if (hits.length) return hits;
    return rectIntersection(args);
  }, []);

  const onDragStart = (e: DragStartEvent) => setActiveId(Number(String(e.active.id).slice(5)));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const itemId = Number(String(active.id).slice(5));
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const targetCell = (over.data.current as { cell: string }).cell;
    const target = parseCell(targetCell);
    if (!target.column) return;
    const list = (cells.get(targetCell) ?? []).filter((i) => i.id !== itemId);
    let before: number | undefined;
    let after: number | undefined;
    const overId = String(over.id);
    if (overId.startsWith("over:")) {
      const overItemId = Number(overId.slice(5));
      if (overItemId === itemId) return;
      const idx = list.findIndex((i) => i.id === overItemId);
      const src = locate(itemId);
      const full = cells.get(targetCell) ?? [];
      const movingDown = src?.cell === targetCell && src.index < full.findIndex((i) => i.id === overItemId);
      if (movingDown) {
        before = list[idx]?.boardOrder;
        after = list[idx + 1]?.boardOrder;
      } else {
        before = list[idx - 1]?.boardOrder;
        after = list[idx]?.boardOrder;
      }
    } else {
      before = list.at(-1)?.boardOrder;
    }
    const src = locate(itemId);
    if (src?.cell === targetCell && before === src.list[src.index - 1]?.boardOrder && after === src.list[src.index + 1]?.boardOrder) return;
    performMove(item, target.column, target.done, target.lane, before, after);
  };

  // Keyboard: "/" focuses the filter, "n" creates an item; Escape closes the panel (handled in ItemPanel)
  useShortcuts({
    "/": () => searchRef.current?.focus(),
    n: () => {
      if (!canCreate) return;
      returnFocus.current = document.activeElement as HTMLElement;
      setOpenId(null);
      setNewDefaults({ moduleId: props.defaults.moduleId, phaseId: props.defaults.phaseId });
    },
  });

  const closePanel = () => {
    setOpenId(null);
    setNewDefaults(null);
    returnFocus.current?.focus?.();
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : undefined;
  const hasSplit = columns.some((c) => c.split);
  const gridTemplate = columns.map((c) => (c.split ? "minmax(200px,1fr) minmax(200px,1fr)" : "minmax(240px,1fr)")).join(" ");
  const noLanes = props.swimlanes.mode === "none";
  const cellMaxHeight = noLanes ? "calc(100vh - 230px)" : "520px";
  const firstColumn = columns[0];

  const renderCard = (item: ItemView, cell: string, colId: string, multiState: boolean) => (
    <DraggableCard item={item} cell={cell} disabled={!canEdit}>
      {(dragging) => (
        <Card
          item={item}
          type={typeById.get(item.typeId)}
          fields={props.cardConfig.fields}
          style={cardStyle(item, props.cardConfig.rules, qctx)}
          overdue={isOverdue(item, qctx)}
          assignee={item.assignedToId ? userById.get(item.assignedToId) : undefined}
          module={item.moduleId ? moduleById.get(item.moduleId) : undefined}
          phase={item.phaseId ? phaseById.get(item.phaseId) : undefined}
          showState={multiState || props.cardConfig.fields.includes("state")}
          columns={columns}
          currentColumnId={colId}
          lanes={lanes}
          users={teamUsers}
          currentUserId={user.id}
          canEdit={canEdit}
          canAssign={can("items.assign")}
          actions={actions}
          t={t}
          locale={locale}
          dragging={dragging}
        />
      )}
    </DraggableCard>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2">
          <h1 className="sr-only">
            {t("board.title")}: {props.team.name}
          </h1>
          <label htmlFor="team-switch" className="sr-only">
            {t("board.selectTeam")}
          </label>
          <select
            id="team-switch"
            className="input w-auto py-1 font-semibold"
            value={props.team.id}
            onChange={(e) => router.push(`/p/${meta.id}/boards/${e.target.value}`)}
          >
            {props.teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
          {canCreate && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                returnFocus.current = document.activeElement as HTMLElement;
                setOpenId(null);
                setNewDefaults({ moduleId: props.defaults.moduleId, phaseId: props.defaults.phaseId });
              }}
            >
              + {t("item.new")}
            </button>
          )}
          {canConfigure && (
            <Link href={`/p/${meta.id}/boards/${props.team.id}/settings`} className="btn btn-ghost btn-sm" aria-label={t("board.settings")} title={t("board.settings")}>
              ⚙
            </Link>
          )}
          <Link href={`/p/${meta.id}/dashboard?board=${props.team.id}`} className="btn btn-ghost btn-sm">
            ▥ {t("board.reports")}
          </Link>
          {canConfigure && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewBoardOpen(true)}>
              + {t("newBoard.button")}
            </button>
          )}
          <div className="w-full lg:ml-2 lg:w-auto lg:flex-1">
            <FilterBar value={filter} onChange={setFilter} allTags={allTags} shown={visible.length} total={items.length} searchRef={searchRef} savedQueries={props.savedQueries} />
          </div>
        </div>
        {unmapped > 0 && (
          <div role="status" className="border-b border-amber-200 bg-warn-soft px-4 py-1 text-sm text-warn">
            {unmapped} {t("board.unmapped")}
            {canConfigure && (
              <>
                {" · "}
                <Link className="underline" href={`/p/${meta.id}/boards/${props.team.id}/settings`}>
                  {t("board.settings")}
                </Link>
              </>
            )}
          </div>
        )}

        {/* Board grid */}
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="grid gap-x-2" style={{ gridTemplateColumns: gridTemplate, minWidth: "fit-content" }}>
              {/* Column headers */}
              {columns.map((c, ci) => {
                const count = columnCounts.get(c.id) ?? 0;
                const wip = wipStatus(count, c.wipLimit);
                return (
                  <div
                    key={c.id}
                    className={`sticky top-0 z-20 rounded-t-sm border-b-2 bg-canvas px-2 pb-1 pt-1 ${wip === "over" ? "border-red-600" : wip === "at" ? "border-amber-500" : "border-line-strong"}`}
                    style={{ gridColumn: c.split ? "span 2" : "span 1" }}
                  >
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-semibold">{c.name}</h2>
                      <span
                        className={`rounded px-1.5 text-xs font-semibold ${wip === "over" ? "bg-red-600 text-white" : wip === "at" ? "bg-amber-100 text-amber-900" : "text-ink-muted"}`}
                        title={c.wipLimit ? `${t("board.wip")}: ${c.wipLimit}` : undefined}
                        aria-label={c.wipLimit ? `${count} / ${t("board.wip")} ${c.wipLimit}${wip === "over" ? ` – ${t("board.wipExceeded")}` : ""}` : `${count} ${t("board.items")}`}
                      >
                        {count}
                        {c.wipLimit ? `/${c.wipLimit}` : ""}
                      </span>
                      {ci === 0 && canCreate && firstColumn && <QuickAdd teamDefaults={props.defaults} onCreated={refresh} />}
                    </div>
                    {hasSplit && c.split && (
                      <div className="mt-1 grid grid-cols-2 text-xs font-semibold text-ink-muted">
                        <span>{t("board.doing")}</span>
                        <span className="pl-2">{t("board.done")}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Lanes */}
              {lanes.map((lane) => {
                const isCollapsed = collapsed.has(lane.key);
                const laneCount = grouped.get(lane.key)?.length ?? 0;
                return (
                  <LaneRows
                    key={lane.key}
                    lane={lane}
                    showHeader={!noLanes}
                    collapsed={isCollapsed}
                    count={laneCount}
                    onToggle={() =>
                      setCollapsed((s) => {
                        const n = new Set(s);
                        if (n.has(lane.key)) n.delete(lane.key);
                        else n.add(lane.key);
                        return n;
                      })
                    }
                    t={t}
                  >
                    {!isCollapsed &&
                      columns.flatMap((c) =>
                        (c.split ? [false, true] : [false]).map((done) => {
                          const key = cellKey(lane.key, c.id, done);
                          const list = cells.get(key) ?? [];
                          const multiState = Object.values(c.stateMap).some((s) => s.length > 1);
                          return (
                            <div key={key} className="pb-2" role="list" aria-label={`${lane.name} – ${c.name}${c.split ? ` – ${done ? t("board.done") : t("board.doing")}` : ""}`}>
                              <DroppableCell id={key} wip={wipStatus(columnCounts.get(c.id) ?? 0, c.wipLimit)}>
                                <CellList items={list} maxHeight={cellMaxHeight} renderItem={(it) => <div role="listitem">{renderCard(it, key, c.id, multiState)}</div>} />
                              </DroppableCell>
                            </div>
                          );
                        }),
                      )}
                  </LaneRows>
                );
              })}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              <div className="w-60 rotate-1 rounded border border-brand bg-white p-2 text-sm shadow-xl">
                <span className="mr-1 font-semibold text-ink-muted">{activeItem.id}</span>
                {activeItem.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {(openId !== null || newDefaults) && (
        <ItemPanel
          key={openId ?? "new"}
          itemId={openId}
          newDefaults={newDefaults ?? undefined}
          onClose={closePanel}
          onSaved={refresh}
          onCreated={(id) => {
            setNewDefaults(null);
            setOpenId(id);
          }}
          onOpenItem={(id) => {
            setNewDefaults(null);
            setOpenId(id);
          }}
          onNewItem={(d) => {
            setOpenId(null);
            setNewDefaults(d);
          }}
        />
      )}
      {newBoardOpen && <NewBoardDialog boards={props.teams} currentBoardId={props.team.id} onClose={() => setNewBoardOpen(false)} />}
    </div>
  );
}

function LaneRows({ lane, showHeader, collapsed, count, onToggle, children, t }: { lane: Lane; showHeader: boolean; collapsed: boolean; count: number; onToggle: () => void; children: ReactNode; t: (k: MessageKey) => string }) {
  return (
    <>
      {showHeader && (
        <div className="sticky left-0 col-span-full mt-1 flex items-center gap-2 py-1" style={{ gridColumn: "1 / -1" }}>
          <button type="button" className="flex items-center gap-2 rounded px-1 text-sm font-semibold hover:bg-gray-200" aria-expanded={!collapsed} onClick={onToggle} title={collapsed ? t("board.expand") : t("board.collapse")}>
            <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
            {lane.color && <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: lane.color }} />}
            {lane.name}
            <span className="font-normal text-ink-muted">({count})</span>
          </button>
        </div>
      )}
      {children}
    </>
  );
}

function QuickAdd({ teamDefaults, onCreated }: { teamDefaults: { moduleId: string | null; phaseId: string | null }; onCreated: () => void }) {
  const { t } = useI18n();
  const { meta } = useProject();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState(() => meta.types.find((x) => !x.disabled)?.id ?? "");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button type="button" className="icon-btn ml-auto h-6 w-6" aria-label={t("board.quickAdd")} title={t("board.quickAdd")} onClick={() => setOpen(true)}>
        +
      </button>
    );
  }
  const submit = () => {
    if (!title.trim()) return;
    start(async () => {
      const res = await createItem({ projectId: meta.id, typeId, title: title.trim(), moduleId: teamDefaults.moduleId, phaseId: teamDefaults.phaseId });
      if (!res.ok) return toast(res.error, "error");
      toast(t("item.created", { id: res.data.id }), "success");
      setTitle("");
      onCreated();
    });
  };
  return (
    <form
      className="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col gap-1 rounded-md border border-brand bg-white p-2 shadow-lg"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <label className="sr-only" htmlFor="qa-title">
        {t("field.title")}
      </label>
      <input ref={input} id="qa-title" className="input" placeholder={t("board.quickAddPlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
      <div className="flex gap-1">
        <label className="sr-only" htmlFor="qa-type">
          {t("field.type")}
        </label>
        <select id="qa-type" className="input py-0.5 text-xs" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {meta.types
            .filter((x) => !x.disabled)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !title.trim()}>
          {t("common.add")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          {t("common.close")}
        </button>
      </div>
    </form>
  );
}
