// Dashboard metrics (pure, unit-tested). Computed on the server and passed to the chart components.
import type { ItemView, ProjectMeta } from "./types";
import { categoryOf, isClosedCategory, type StateCategory } from "./workflow";
import { isOverdue } from "./query";
import { TEST_OUTCOMES, type TestOutcome } from "./fields";

/** State transitions from HistoryEntry (field "state" or "__created"). */
export interface StateEvent {
  itemId: number;
  /** "__created" carries the initial state in `to` */
  field: "state" | "__created";
  from: string | null;
  to: string | null;
  at: string;
}

export const FLOW_CATEGORIES: Exclude<StateCategory, "REMOVED">[] = ["PROPOSED", "IN_PROGRESS", "RESOLVED", "COMPLETED"];
export const AGE_BUCKETS = [
  { key: "0-3", max: 3 },
  { key: "4-7", max: 7 },
  { key: "8-14", max: 14 },
  { key: "15-30", max: 30 },
  { key: "30+", max: Infinity },
] as const;

const DAY = 86_400_000;
const NO_MODULE = "__none";

export interface DashboardData {
  kpis: { openDefects: number; criticalDefects: number; overdue: number; testsTotal: number; testsExecuted: number; passRate: number | null };
  stateByModule: ({ module: string } & Record<(typeof FLOW_CATEGORIES)[number], number>)[];
  outcomesByModule: ({ module: string } & Record<TestOutcome, number>)[];
  defectsBySeverity: { severity: string; count: number }[];
  defectsByState: { state: string; count: number }[];
  defectsByAssignee: { userId: string | null; name: string; count: number }[];
  defectAgeing: { bucket: string; count: number }[];
  overdue: { id: number; title: string; dueDate: string; assignee: string; typeId: string }[];
  flow: ({ date: string } & Record<(typeof FLOW_CATEGORIES)[number], number>)[];
  burndown: { phaseName: string; points: { date: string; remaining: number | null; ideal: number }[] } | null;
}

export interface DashboardOptions {
  now: Date;
  /** Only items in this phase ("" = all) */
  phaseId: string;
  /** Work item type key for the cumulative flow ("" = all types) */
  flowType: string;
  flowDays: number;
  unassignedLabel: string;
  noModuleLabel: string;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function endOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/** Top-level module for roll-ups (e.g. "Employee Central > Hire" -> "Employee Central"). */
function rootModule(meta: Pick<ProjectMeta, "modules">): (moduleId: string | null) => string {
  const byId = new Map(meta.modules.map((m) => [m.id, m]));
  return (id) => {
    let cur = id ? byId.get(id) : undefined;
    let guard = 0;
    while (cur?.parentId && guard++ < 50) cur = byId.get(cur.parentId) ?? undefined;
    return cur?.id ?? NO_MODULE;
  };
}

/** Each item's state at the end of each day, reconstructed from its transitions. */
export function stateAt(item: Pick<ItemView, "id" | "state" | "createdAt">, events: StateEvent[], at: number): string | null {
  if (new Date(item.createdAt).getTime() > at) return null;
  let state: string | null = null;
  let initial: string | null = null;
  for (const e of events) {
    if (e.field === "__created") {
      initial = e.to;
      continue;
    }
    if (initial === null && e.from) initial = e.from;
    if (new Date(e.at).getTime() <= at) state = e.to;
  }
  return state ?? initial ?? item.state;
}

export function computeDashboard(items: ItemView[], events: StateEvent[], meta: Pick<ProjectMeta, "types" | "modules" | "phases" | "users">, o: DashboardOptions): DashboardData {
  const types = new Map(meta.types.map((t) => [t.id, t]));
  const typeKey = (i: ItemView) => types.get(i.typeId)?.key ?? "";
  const cat = (i: ItemView, state = i.state) => {
    const t = types.get(i.typeId);
    return t ? categoryOf({ states: t.states }, state) : undefined;
  };
  const scoped = o.phaseId ? items.filter((i) => i.phaseId === o.phaseId) : items;
  const root = rootModule(meta);
  const moduleName = (id: string) => (id === NO_MODULE ? o.noModuleLabel : (meta.modules.find((m) => m.id === id)?.name ?? o.noModuleLabel));
  const moduleOrder = [...meta.modules.filter((m) => !m.parentId).sort((a, b) => a.order - b.order).map((m) => m.id), NO_MODULE];
  const qctx = { types, now: o.now };

  const defects = scoped.filter((i) => typeKey(i) === "DEFECT");
  const openDefects = defects.filter((i) => !isClosedCategory(cat(i)));
  const tests = scoped.filter((i) => typeKey(i) === "TEST_TASK");
  const outcomeOf = (i: ItemView): TestOutcome => {
    const v = i.fields.outcome;
    return typeof v === "string" && (TEST_OUTCOMES as readonly string[]).includes(v) ? (v as TestOutcome) : "Not run";
  };
  const executed = tests.filter((i) => outcomeOf(i) !== "Not run");
  const passed = tests.filter((i) => outcomeOf(i) === "Passed");
  const overdueItems = scoped.filter((i) => isOverdue(i, qctx)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  // State by module (all types, removed items left out)
  const sbm = new Map<string, Record<string, number>>();
  for (const i of scoped) {
    const c = cat(i);
    if (!c || c === "REMOVED") continue;
    const m = root(i.moduleId);
    const row = sbm.get(m) ?? Object.fromEntries(FLOW_CATEGORIES.map((k) => [k, 0]));
    row[c]++;
    sbm.set(m, row);
  }
  const obm = new Map<string, Record<string, number>>();
  for (const i of tests) {
    const m = root(i.moduleId);
    const row = obm.get(m) ?? Object.fromEntries(TEST_OUTCOMES.map((k) => [k, 0]));
    row[outcomeOf(i)]++;
    obm.set(m, row);
  }

  // Defects by assignee: every active user, plus unassigned, so nobody's zero is hidden.
  const byAssignee = new Map<string | null, number>([[null, 0], ...meta.users.map((u) => [u.id, 0] as [string, number])]);
  for (const d of openDefects) byAssignee.set(d.assignedToId, (byAssignee.get(d.assignedToId) ?? 0) + 1);

  const defectType = meta.types.find((t) => t.key === "DEFECT");
  const ageing = AGE_BUCKETS.map((b) => ({ bucket: b.key, count: 0 }));
  for (const d of openDefects) {
    const age = Math.floor((o.now.getTime() - new Date(d.createdAt).getTime()) / DAY);
    const idx = AGE_BUCKETS.findIndex((b) => age <= b.max);
    ageing[idx === -1 ? ageing.length - 1 : idx].count++;
  }

  // Cumulative flow
  const eventsByItem = new Map<number, StateEvent[]>();
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const list = eventsByItem.get(e.itemId) ?? [];
    list.push(e);
    eventsByItem.set(e.itemId, list);
  }
  const flowItems = o.flowType ? scoped.filter((i) => typeKey(i) === o.flowType) : scoped;
  const flow: DashboardData["flow"] = [];
  for (let d = o.flowDays - 1; d >= 0; d--) {
    const day = new Date(o.now.getFullYear(), o.now.getMonth(), o.now.getDate() - d);
    const at = endOfDay(day);
    const row = { date: dayKey(day), PROPOSED: 0, IN_PROGRESS: 0, RESOLVED: 0, COMPLETED: 0 };
    for (const i of flowItems) {
      const s = stateAt(i, eventsByItem.get(i.id) ?? [], at);
      const c = s ? cat(i, s) : undefined;
      if (c && c !== "REMOVED") row[c]++;
    }
    flow.push(row);
  }

  // Burn-down: open test tasks in the selected phase between its start and end dates.
  let burndown: DashboardData["burndown"] = null;
  const phase = meta.phases.find((p) => p.id === o.phaseId);
  if (phase?.startDate && phase.endDate) {
    const start = new Date(phase.startDate);
    const end = new Date(phase.endDate);
    const days = Math.max(1, Math.round((endOfDay(end) - endOfDay(start)) / DAY));
    const points: { date: string; remaining: number | null; ideal: number }[] = [];
    let scope = 0;
    for (let d = 0; d <= days; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      const at = endOfDay(day);
      let remaining: number | null = null;
      if (at - DAY < o.now.getTime()) {
        remaining = 0;
        let existing = 0;
        for (const i of tests) {
          const s = stateAt(i, eventsByItem.get(i.id) ?? [], at);
          if (s === null) continue;
          existing++;
          if (!isClosedCategory(cat(i, s))) remaining++;
        }
        if (d === 0) scope = existing;
      }
      points.push({ date: dayKey(day), remaining, ideal: 0 });
    }
    const total = Math.max(scope, tests.length);
    points.forEach((p, idx) => (p.ideal = Math.round((total * (1 - idx / days)) * 10) / 10));
    burndown = { phaseName: phase.name, points };
  }

  return {
    kpis: {
      openDefects: openDefects.length,
      criticalDefects: openDefects.filter((d) => (d.severity ?? 4) <= 2).length,
      overdue: overdueItems.length,
      testsTotal: tests.length,
      testsExecuted: executed.length,
      passRate: executed.length ? Math.round((passed.length / executed.length) * 100) : null,
    },
    stateByModule: moduleOrder.filter((m) => sbm.has(m)).map((m) => ({ module: moduleName(m), ...(sbm.get(m) as Record<(typeof FLOW_CATEGORIES)[number], number>) })),
    outcomesByModule: moduleOrder.filter((m) => obm.has(m)).map((m) => ({ module: moduleName(m), ...(obm.get(m) as Record<TestOutcome, number>) })),
    defectsBySeverity: [1, 2, 3, 4].map((s) => ({ severity: String(s), count: openDefects.filter((d) => (d.severity ?? 3) === s).length })),
    defectsByState: (defectType?.states ?? []).map((s) => ({ state: s.name, count: defects.filter((d) => d.state === s.name).length })),
    defectsByAssignee: [...byAssignee.entries()]
      .map(([userId, count]) => ({ userId, name: userId ? (meta.users.find((u) => u.id === userId)?.name ?? "?") : o.unassignedLabel, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    defectAgeing: ageing,
    overdue: overdueItems.slice(0, 50).map((i) => ({
      id: i.id,
      title: i.title,
      dueDate: i.dueDate!,
      assignee: i.assignedToId ? (meta.users.find((u) => u.id === i.assignedToId)?.name ?? "") : o.unassignedLabel,
      typeId: i.typeId,
    })),
    flow,
    burndown,
  };
}
