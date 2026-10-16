// Query evaluation used by saved queries, the filter bar, swimlane rules and
// card colour rules. Evaluation is pure so it can run on server and client.
import type { ItemView, TypeLite, ModuleLite } from "./types";
import { categoryOf, isClosedCategory } from "./workflow";

export const OPS = [
  "eq",
  "neq",
  "in",
  "notIn",
  "contains",
  "notContains",
  "gt",
  "gte",
  "lt",
  "lte",
  "isEmpty",
  "isNotEmpty",
  "under",
] as const;
export type Op = (typeof OPS)[number];

export interface Condition {
  field: string;
  op: Op;
  value?: unknown;
}

export interface Group {
  logic: "and" | "or";
  clauses: Clause[];
}

export type Clause = Condition | Group;

export interface SortSpec {
  field: string;
  dir: "asc" | "desc";
}

export interface QueryDefinition {
  root: Group;
  sort?: SortSpec[];
}

export interface QueryContext {
  currentUserId?: string;
  now?: Date;
  types: Map<string, TypeLite>;
  /** moduleId -> set of itself + all descendant ids */
  moduleSubtree?: Map<string, Set<string>>;
}

export type FieldType = "number" | "string" | "date" | "boolean" | "user" | "module" | "phase" | "type" | "state" | "category" | "tags";

/** Queryable fields and their value types. Custom fields use the "fields.<key>" prefix. */
export const QUERY_FIELDS: Record<string, FieldType> = {
  id: "number",
  title: "string",
  keyword: "string",
  type: "type",
  state: "state",
  category: "category",
  assignedTo: "user",
  createdBy: "user",
  module: "module",
  phase: "phase",
  priority: "number",
  severity: "number",
  tags: "tags",
  dueDate: "date",
  createdAt: "date",
  changedAt: "date",
  stateChangedAt: "date",
  commentCount: "number",
  childCount: "number",
  linkCount: "number",
  parentId: "number",
  overdue: "boolean",
  ageDays: "number",
};

export function isGroup(c: Clause): c is Group {
  return (c as Group).clauses !== undefined;
}

export function emptyQuery(): QueryDefinition {
  return { root: { logic: "and", clauses: [] } };
}

const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Resolve macros such as @me, @today, @today-7 */
export function resolveMacro(value: unknown, ctx: QueryContext): unknown {
  if (typeof value !== "string") return value;
  if (value === "@me") return ctx.currentUserId ?? null;
  const m = /^@today(?:([+-])(\d+))?$/.exec(value);
  if (m) {
    const now = ctx.now ?? new Date();
    const offset = m[1] ? (m[1] === "-" ? -1 : 1) * Number(m[2]) : 0;
    return new Date(startOfDay(now).getTime() + offset * DAY).toISOString();
  }
  return value;
}

export function fieldValue(item: ItemView, field: string, ctx: QueryContext): unknown {
  const type = ctx.types.get(item.typeId);
  switch (field) {
    case "id":
      return item.id;
    case "title":
      return item.title;
    case "keyword":
      return `#${item.id} ${item.title} ${item.descriptionText ?? ""} ${item.tags.join(" ")}`;
    case "type":
      return type?.key ?? item.typeId;
    case "state":
      return item.state;
    case "category":
      return type ? categoryOf({ states: type.states }, item.state) ?? null : null;
    case "assignedTo":
      return item.assignedToId;
    case "createdBy":
      return item.createdById;
    case "module":
      return item.moduleId;
    case "phase":
      return item.phaseId;
    case "priority":
      return item.priority;
    case "severity":
      return item.severity;
    case "tags":
      return item.tags;
    case "dueDate":
      return item.dueDate;
    case "createdAt":
      return item.createdAt;
    case "changedAt":
      return item.changedAt;
    case "stateChangedAt":
      return item.stateChangedAt;
    case "commentCount":
      return item.commentCount;
    case "childCount":
      return item.childTotal;
    case "linkCount":
      return item.linkCount;
    case "parentId":
      return item.parentId;
    case "overdue":
      return isOverdue(item, ctx);
    case "ageDays": {
      const now = (ctx.now ?? new Date()).getTime();
      return Math.floor((now - new Date(item.createdAt).getTime()) / DAY);
    }
    default:
      if (field.startsWith("fields.")) return item.fields[field.slice(7)] ?? null;
      return undefined;
  }
}

export function isOverdue(item: ItemView, ctx: Pick<QueryContext, "types" | "now">): boolean {
  if (!item.dueDate) return false;
  const type = ctx.types.get(item.typeId);
  const cat = type ? categoryOf({ states: type.states }, item.state) : undefined;
  if (isClosedCategory(cat) || cat === "RESOLVED") return false;
  const today = startOfDay(ctx.now ?? new Date());
  return new Date(item.dueDate).getTime() < today.getTime();
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function toComparable(v: unknown, fieldType: FieldType | undefined): number | string | null {
  if (v === null || v === undefined || v === "") return null;
  if (fieldType === "date") {
    const t = new Date(String(v)).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (fieldType === "number" || typeof v === "number") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return String(v).toLowerCase();
}

function eqValue(a: unknown, b: unknown, fieldType: FieldType | undefined): boolean {
  if (fieldType === "date") {
    if (isEmptyValue(a) || isEmptyValue(b)) return isEmptyValue(a) && isEmptyValue(b);
    return startOfDay(new Date(String(a))).getTime() === startOfDay(new Date(String(b))).getTime();
  }
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  const ca = toComparable(a, fieldType);
  const cb = toComparable(b, fieldType);
  return ca === cb;
}

export function evaluateCondition(item: ItemView, cond: Condition, ctx: QueryContext): boolean {
  const fieldType = QUERY_FIELDS[cond.field];
  const actual = fieldValue(item, cond.field, ctx);
  const rawExpected = Array.isArray(cond.value) ? cond.value.map((v) => resolveMacro(v, ctx)) : resolveMacro(cond.value, ctx);

  switch (cond.op) {
    case "isEmpty":
      return isEmptyValue(actual);
    case "isNotEmpty":
      return !isEmptyValue(actual);
    case "eq":
      if (Array.isArray(actual)) return actual.some((a) => eqValue(a, rawExpected, fieldType));
      return eqValue(actual, rawExpected, fieldType);
    case "neq":
      if (Array.isArray(actual)) return !actual.some((a) => eqValue(a, rawExpected, fieldType));
      return !eqValue(actual, rawExpected, fieldType);
    case "in":
    case "notIn": {
      const list = Array.isArray(rawExpected) ? rawExpected : [rawExpected];
      const hit = Array.isArray(actual)
        ? actual.some((a) => list.some((e) => eqValue(a, e, fieldType)))
        : list.some((e) => eqValue(actual, e, fieldType));
      return cond.op === "in" ? hit : !hit;
    }
    case "contains":
    case "notContains": {
      const needle = String(rawExpected ?? "").toLowerCase();
      const hay = Array.isArray(actual) ? actual.map((a) => String(a).toLowerCase()) : [String(actual ?? "").toLowerCase()];
      const hit = Array.isArray(actual) ? hay.some((h) => h.includes(needle)) : hay[0].includes(needle);
      return cond.op === "contains" ? hit : !hit;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toComparable(actual, fieldType);
      const b = toComparable(rawExpected, fieldType);
      if (a === null || b === null) return false;
      if (cond.op === "gt") return a > b;
      if (cond.op === "gte") return a >= b;
      if (cond.op === "lt") return a < b;
      return a <= b;
    }
    case "under": {
      // Module tree: item's module is the given module or any descendant.
      if (typeof actual !== "string" || typeof rawExpected !== "string") return false;
      const subtree = ctx.moduleSubtree?.get(rawExpected);
      return subtree ? subtree.has(actual) : actual === rawExpected;
    }
    default:
      return false;
  }
}

export function evaluateClause(item: ItemView, clause: Clause, ctx: QueryContext): boolean {
  if (isGroup(clause)) {
    if (clause.clauses.length === 0) return true;
    return clause.logic === "and"
      ? clause.clauses.every((c) => evaluateClause(item, c, ctx))
      : clause.clauses.some((c) => evaluateClause(item, c, ctx));
  }
  return evaluateCondition(item, clause, ctx);
}

export function runQuery(items: ItemView[], def: QueryDefinition, ctx: QueryContext): ItemView[] {
  const matched = items.filter((i) => evaluateClause(i, def.root, ctx));
  return def.sort?.length ? sortItems(matched, def.sort, ctx) : matched;
}

export function sortItems(items: ItemView[], sort: SortSpec[], ctx: QueryContext): ItemView[] {
  return [...items].sort((x, y) => {
    for (const s of sort) {
      const ft = QUERY_FIELDS[s.field];
      const a = toComparable(fieldValue(x, s.field, ctx), ft);
      const b = toComparable(fieldValue(y, s.field, ctx), ft);
      if (a === b) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      const r = a < b ? -1 : 1;
      return s.dir === "asc" ? r : -r;
    }
    return x.id - y.id;
  });
}

/** Build moduleId -> subtree id set for "under" conditions and team area filters. */
export function buildModuleSubtree(modules: Pick<ModuleLite, "id" | "parentId">[]): Map<string, Set<string>> {
  const children = new Map<string, string[]>();
  for (const m of modules) {
    if (!m.parentId) continue;
    const list = children.get(m.parentId) ?? [];
    list.push(m.id);
    children.set(m.parentId, list);
  }
  const result = new Map<string, Set<string>>();
  const collect = (id: string, acc: Set<string>) => {
    acc.add(id);
    for (const c of children.get(id) ?? []) collect(c, acc);
  };
  for (const m of modules) {
    const s = new Set<string>();
    collect(m.id, s);
    result.set(m.id, s);
  }
  return result;
}

export function parseQueryDefinition(json: string | null | undefined): QueryDefinition {
  if (!json) return emptyQuery();
  try {
    const v = JSON.parse(json);
    if (v && v.root && Array.isArray(v.root.clauses)) return v as QueryDefinition;
  } catch {
    /* fall through */
  }
  return emptyQuery();
}
