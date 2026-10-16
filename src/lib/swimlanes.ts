// Swimlanes: rows on the board. Either derived from a field (module, assignee,
// priority) or from ordered custom rules (first matching rule wins).
import type { Group } from "./query";
import { evaluateClause, type QueryContext } from "./query";
import type { ItemView, ModuleLite, UserLite } from "./types";

export type SwimlaneMode = "none" | "module" | "assignee" | "priority" | "rules";

export interface LaneRule {
  id: string;
  name: string;
  color?: string;
  when: Group;
}

export interface SwimlaneConfig {
  mode: SwimlaneMode;
  rules?: LaneRule[];
  /** Name of the lane for items matching no rule (rules mode) */
  defaultLaneName?: string;
  /** Lanes collapsed by default */
  collapsed?: string[];
}

export interface Lane {
  key: string;
  name: string;
  color?: string;
  /** The field change implied by dropping a card into this lane, if any. */
  assign?: { field: "moduleId" | "assignedToId" | "priority"; value: string | number | null };
}

export const DEFAULT_LANE_KEY = "__default";

export function parseSwimlaneConfig(json: string | null | undefined): SwimlaneConfig {
  try {
    const v = JSON.parse(json ?? "");
    if (v && typeof v.mode === "string") return v as SwimlaneConfig;
  } catch {
    /* ignore */
  }
  return { mode: "none" };
}

export interface LaneContext {
  modules: ModuleLite[];
  users: UserLite[];
  query: QueryContext;
  /** Labels (translated) */
  labels?: { unassigned?: string; noModule?: string; default?: string; priority?: (p: number) => string };
}

/** Top-level module for an item (lanes group by top-level module so sub-modules share a lane). */
function topModuleId(moduleId: string | null, modules: ModuleLite[]): string | null {
  if (!moduleId) return null;
  const byId = new Map(modules.map((m) => [m.id, m]));
  let cur = byId.get(moduleId);
  while (cur && cur.parentId) {
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur?.id ?? moduleId;
}

export function laneKeyForItem(item: ItemView, config: SwimlaneConfig, ctx: LaneContext): string {
  switch (config.mode) {
    case "none":
      return DEFAULT_LANE_KEY;
    case "module":
      return topModuleId(item.moduleId, ctx.modules) ?? DEFAULT_LANE_KEY;
    case "assignee":
      return item.assignedToId ?? DEFAULT_LANE_KEY;
    case "priority":
      return `p${item.priority}`;
    case "rules": {
      for (const r of config.rules ?? []) {
        if (r.when.clauses.length > 0 && evaluateClause(item, r.when, ctx.query)) return r.id;
      }
      return DEFAULT_LANE_KEY;
    }
  }
}

/** The ordered list of lanes to render (all lanes, even empty ones, so cards can be dropped there). */
export function buildLanes(config: SwimlaneConfig, ctx: LaneContext): Lane[] {
  const L = ctx.labels ?? {};
  switch (config.mode) {
    case "none":
      return [{ key: DEFAULT_LANE_KEY, name: L.default ?? "Default" }];
    case "module": {
      const tops = ctx.modules.filter((m) => !m.parentId).sort((a, b) => a.order - b.order);
      return [
        ...tops.map((m) => ({ key: m.id, name: m.name, assign: { field: "moduleId" as const, value: m.id } })),
        { key: DEFAULT_LANE_KEY, name: L.noModule ?? "No module", assign: { field: "moduleId" as const, value: null } },
      ];
    }
    case "assignee": {
      const users = [...ctx.users].sort((a, b) => a.name.localeCompare(b.name));
      return [
        ...users.map((u) => ({ key: u.id, name: u.name, color: u.color, assign: { field: "assignedToId" as const, value: u.id } })),
        { key: DEFAULT_LANE_KEY, name: L.unassigned ?? "Unassigned", assign: { field: "assignedToId" as const, value: null } },
      ];
    }
    case "priority":
      return [1, 2, 3, 4].map((p) => ({
        key: `p${p}`,
        name: L.priority ? L.priority(p) : `Priority ${p}`,
        assign: { field: "priority" as const, value: p },
      }));
    case "rules":
      return [
        ...(config.rules ?? []).map((r) => ({ key: r.id, name: r.name, color: r.color })),
        { key: DEFAULT_LANE_KEY, name: config.defaultLaneName || L.default || "Default" },
      ];
  }
}

/** Group items by lane key; preserves input order. */
export function groupByLane(items: ItemView[], config: SwimlaneConfig, ctx: LaneContext): Map<string, ItemView[]> {
  const out = new Map<string, ItemView[]>();
  for (const it of items) {
    const k = laneKeyForItem(it, config, ctx);
    const list = out.get(k) ?? [];
    list.push(it);
    out.set(k, list);
  }
  return out;
}

/** In assignee mode, hide lanes for users without items unless they are team members. */
export function visibleLanes(lanes: Lane[], grouped: Map<string, ItemView[]>, config: SwimlaneConfig, memberIds?: Set<string>): Lane[] {
  if (config.mode !== "assignee") return lanes;
  return lanes.filter((l) => l.key === DEFAULT_LANE_KEY || (grouped.get(l.key)?.length ?? 0) > 0 || memberIds?.has(l.key));
}
