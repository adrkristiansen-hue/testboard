// Filter bar state (board and lists) and its translation into a query.
import type { Clause, Condition, QueryDefinition } from "./query";

export const UNASSIGNED = "__none";

export interface FilterState {
  keyword: string;
  types: string[]; // type keys
  assignees: string[]; // user ids or UNASSIGNED
  modules: string[]; // module ids (match subtree)
  phases: string[];
  states: string[];
  tags: string[];
  priorities: number[];
}

export const EMPTY_FILTER: FilterState = {
  keyword: "",
  types: [],
  assignees: [],
  modules: [],
  phases: [],
  states: [],
  tags: [],
  priorities: [],
};

export function isFilterActive(f: FilterState): boolean {
  return (
    f.keyword.trim() !== "" ||
    f.types.length > 0 ||
    f.assignees.length > 0 ||
    f.modules.length > 0 ||
    f.phases.length > 0 ||
    f.states.length > 0 ||
    f.tags.length > 0 ||
    f.priorities.length > 0
  );
}

export function filterToQuery(f: FilterState): QueryDefinition {
  const clauses: Clause[] = [];
  const kw = f.keyword.trim();
  if (kw) {
    // "#123" or "123" matches the id exactly; otherwise all words must appear.
    const idMatch = /^#?(\d+)$/.exec(kw);
    if (idMatch) {
      clauses.push({ logic: "or", clauses: [{ field: "id", op: "eq", value: Number(idMatch[1]) }, { field: "keyword", op: "contains", value: kw }] });
    } else {
      for (const word of kw.split(/\s+/)) clauses.push({ field: "keyword", op: "contains", value: word });
    }
  }
  if (f.types.length) clauses.push({ field: "type", op: "in", value: f.types });
  if (f.assignees.length) {
    const ids = f.assignees.filter((a) => a !== UNASSIGNED);
    const parts: Condition[] = [];
    if (ids.length) parts.push({ field: "assignedTo", op: "in", value: ids });
    if (f.assignees.includes(UNASSIGNED)) parts.push({ field: "assignedTo", op: "isEmpty" });
    clauses.push({ logic: "or", clauses: parts });
  }
  if (f.modules.length) clauses.push({ logic: "or", clauses: f.modules.map((m) => ({ field: "module", op: "under", value: m }) as Condition) });
  if (f.phases.length) clauses.push({ field: "phase", op: "in", value: f.phases });
  if (f.states.length) clauses.push({ field: "state", op: "in", value: f.states });
  if (f.tags.length) clauses.push({ field: "tags", op: "in", value: f.tags });
  if (f.priorities.length) clauses.push({ field: "priority", op: "in", value: f.priorities });
  return { root: { logic: "and", clauses } };
}

/** Serialise filter state to URL search params (so filters survive reloads and can be shared). */
export function filterToParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.keyword) p.set("q", f.keyword);
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.assignees.length) p.set("assignee", f.assignees.join(","));
  if (f.modules.length) p.set("module", f.modules.join(","));
  if (f.phases.length) p.set("phase", f.phases.join(","));
  if (f.states.length) p.set("state", f.states.join(","));
  if (f.tags.length) p.set("tag", f.tags.join(","));
  if (f.priorities.length) p.set("priority", f.priorities.join(","));
  return p;
}

export function filterFromParams(p: URLSearchParams | Record<string, string | string[] | undefined>): FilterState {
  const get = (k: string): string => {
    if (p instanceof URLSearchParams) return p.get(k) ?? "";
    const v = p[k];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };
  const list = (k: string) => get(k).split(",").filter(Boolean);
  return {
    keyword: get("q"),
    types: list("type"),
    assignees: list("assignee"),
    modules: list("module"),
    phases: list("phase"),
    states: list("state"),
    tags: list("tag"),
    priorities: list("priority").map(Number).filter((n) => !Number.isNaN(n)),
  };
}
