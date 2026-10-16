// Kanban board logic: column <-> state mapping, WIP limits, ordering and moves.
import type { TypeLite } from "./types";
import { checkTransition } from "./workflow";

export interface ColumnDef {
  id: string;
  name: string;
  order: number;
  wipLimit: number | null;
  split: boolean;
  /** type id -> states shown in this column. The first state is used when a card is dropped here. */
  stateMap: Record<string, string[]>;
}

export interface BoardItem {
  id: number;
  typeId: string;
  state: string;
  columnDone: boolean;
  boardOrder: number;
}

export function parseStateMap(json: string | null | undefined): Record<string, string[]> {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [k, val] of Object.entries(v ?? {})) {
      if (Array.isArray(val)) out[k] = val.filter((x): x is string => typeof x === "string");
      else if (typeof val === "string") out[k] = [val];
    }
    return out;
  } catch {
    return {};
  }
}

export function sortColumns<T extends { order: number }>(columns: T[]): T[] {
  return [...columns].sort((a, b) => a.order - b.order);
}

/** The column an item appears in: the first column (by order) mapping its type+state. */
export function columnForItem(item: Pick<BoardItem, "typeId" | "state">, columns: ColumnDef[]): ColumnDef | undefined {
  return sortColumns(columns).find((c) => (c.stateMap[item.typeId] ?? []).includes(item.state));
}

export type MoveResult =
  | { ok: true; state: string; columnDone: boolean; stateChanged: boolean }
  | { ok: false; reason: "NO_MAPPING" | "NOT_ALLOWED" };

/**
 * Work out the new state when a card is moved to a column. If the item's current
 * state already belongs to the column, the state is kept (only Doing/Done may change).
 * Otherwise the first mapped state reachable from the current state is used.
 */
export function resolveMove(item: BoardItem, column: ColumnDef, type: Pick<TypeLite, "states" | "transitions">, done = false): MoveResult {
  const targets = column.stateMap[item.typeId] ?? [];
  if (targets.length === 0) return { ok: false, reason: "NO_MAPPING" };
  const columnDone = column.split ? done : false;
  if (targets.includes(item.state)) return { ok: true, state: item.state, columnDone, stateChanged: false };
  const wf = { states: type.states, transitions: type.transitions };
  const allowed = targets.find((s) => checkTransition(wf, item.state, s).ok);
  if (!allowed) return { ok: false, reason: "NOT_ALLOWED" };
  // Moving to a new state always starts in "Doing".
  return { ok: true, state: allowed, columnDone: column.split ? done : false, stateChanged: true };
}

/** Columns that accept the given type (used to build "Move to column" menus). */
export function columnsAcceptingType(typeId: string, columns: ColumnDef[]): ColumnDef[] {
  return sortColumns(columns).filter((c) => (c.stateMap[typeId] ?? []).length > 0);
}

export type WipStatus = "none" | "ok" | "at" | "over";

export function wipStatus(count: number, limit: number | null | undefined): WipStatus {
  if (!limit || limit <= 0) return "none";
  if (count > limit) return "over";
  if (count === limit) return "at";
  return "ok";
}

const ORDER_STEP = 1024;

/** Fractional ranking: a value between two neighbours (either may be missing). */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return (after as number) - ORDER_STEP;
  if (after === undefined) return before + ORDER_STEP;
  return (before + after) / 2;
}

/** True when neighbours are so close that the column should be renumbered. */
export function needsRebalance(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined && Math.abs(after - before) < 1e-6;
}

export function rebalance<T extends { id: number }>(ordered: T[]): Map<number, number> {
  const m = new Map<number, number>();
  ordered.forEach((it, i) => m.set(it.id, i * ORDER_STEP));
  return m;
}

/**
 * Validate a column configuration against the project's types: every non-removed
 * state should appear in exactly one column so every item has a home.
 */
export function validateColumns(columns: ColumnDef[], types: Pick<TypeLite, "id" | "name" | "states" | "disabled">[]): string[] {
  const problems: string[] = [];
  if (columns.length === 0) problems.push("The board needs at least one column.");
  for (const t of types) {
    if (t.disabled) continue;
    for (const s of t.states) {
      const hits = columns.filter((c) => (c.stateMap[t.id] ?? []).includes(s.name));
      if (hits.length === 0 && s.category !== "REMOVED") problems.push(`${t.name}: state "${s.name}" is not on any column.`);
      if (hits.length > 1) problems.push(`${t.name}: state "${s.name}" is mapped to several columns (${hits.map((h) => h.name).join(", ")}).`);
    }
    for (const c of columns) {
      for (const s of c.stateMap[t.id] ?? []) {
        if (!t.states.some((st) => st.name === s)) problems.push(`${c.name}: unknown state "${s}" for ${t.name}.`);
      }
    }
  }
  return problems;
}

export interface BoardCell<T> {
  columnId: string;
  done: boolean;
  items: T[];
}

/**
 * Place items into columns (and Doing/Done halves). Items whose state is not
 * mapped to any column are returned in `unmapped`.
 */
export function placeItems<T extends BoardItem>(items: T[], columns: ColumnDef[]): { byColumn: Map<string, { doing: T[]; done: T[] }>; unmapped: T[] } {
  const byColumn = new Map<string, { doing: T[]; done: T[] }>();
  for (const c of columns) byColumn.set(c.id, { doing: [], done: [] });
  const unmapped: T[] = [];
  const sorted = [...items].sort((a, b) => a.boardOrder - b.boardOrder || a.id - b.id);
  for (const it of sorted) {
    const col = columnForItem(it, columns);
    if (!col) {
      unmapped.push(it);
      continue;
    }
    const bucket = byColumn.get(col.id)!;
    if (col.split && it.columnDone) bucket.done.push(it);
    else bucket.doing.push(it);
  }
  return { byColumn, unmapped };
}
