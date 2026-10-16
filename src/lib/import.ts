// Excel/CSV import: column mapping, validation and preview (pure, unit-tested).
// The same functions run in the browser (preview) and on the server (actual import).
import type { ProjectMeta } from "./types";
import { textToDoc, type RtDoc } from "./richtext";
import { makeResolver, parseDateValue, parseLevel, parseSteps, parseTags } from "./resolve";

export const IMPORT_MAX_ROWS = 5000;

export type ImportTarget =
  | "ignore"
  | "title"
  | "type"
  | "state"
  | "description"
  | "assignedTo"
  | "module"
  | "phase"
  | "priority"
  | "severity"
  | "tags"
  | "dueDate"
  | "parentId"
  | "steps"
  | `fields.${string}`;

export interface ImportTargetDef {
  value: ImportTarget;
  label: string;
}

/** Built-in targets plus every non-steps custom field. */
export function importTargets(meta: Pick<ProjectMeta, "types">): ImportTargetDef[] {
  const builtIn: ImportTargetDef[] = [
    { value: "title", label: "Title" },
    { value: "type", label: "Type" },
    { value: "state", label: "State" },
    { value: "description", label: "Description" },
    { value: "assignedTo", label: "Assigned to" },
    { value: "module", label: "Module" },
    { value: "phase", label: "Phase" },
    { value: "priority", label: "Priority" },
    { value: "severity", label: "Severity" },
    { value: "tags", label: "Tags" },
    { value: "dueDate", label: "Due date" },
    { value: "parentId", label: "Parent ID" },
    { value: "steps", label: "Test steps" },
  ];
  const custom = new Map<string, string>();
  for (const t of meta.types) for (const f of t.fields) if (f.kind !== "steps" && !custom.has(f.key)) custom.set(f.key, f.label);
  return [...builtIn, ...[...custom].map(([k, label]) => ({ value: `fields.${k}` as ImportTarget, label }))];
}

const SYNONYMS: Record<string, string[]> = {
  title: ["title", "tittel", "name", "navn", "summary", "sammendrag", "test case", "testcase", "test case name", "testnavn", "overskrift"],
  type: ["type", "work item type", "item type", "elementtype", "arbeidselementtype"],
  state: ["state", "status", "tilstand"],
  description: ["description", "beskrivelse", "details", "detaljer"],
  assignedTo: ["assigned to", "assignee", "tildelt", "tildelt til", "ansvarlig", "owner", "eier", "tester"],
  module: ["module", "modul", "area", "area path", "område", "omrade", "prosess", "process"],
  phase: ["phase", "fase", "iteration", "iterasjon", "test phase", "testfase", "sprint"],
  priority: ["priority", "prioritet", "prio"],
  severity: ["severity", "alvorlighet", "alvorlighetsgrad"],
  tags: ["tags", "tag", "stikkord", "labels", "etiketter"],
  dueDate: ["due date", "due", "frist", "forfallsdato", "deadline", "target date"],
  parentId: ["parent", "parent id", "forelder", "forelder id"],
  steps: ["steps", "test steps", "teststeg", "steg", "trinn"],
};

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/[_\s]+/g, " ");

/** Guess a target for each header from English/Norwegian names and custom field labels. Each target is used once. */
export function guessMapping(headers: string[], meta: Pick<ProjectMeta, "types">): ImportTarget[] {
  const custom: [string, string[]][] = [];
  for (const t of meta.types)
    for (const f of t.fields) if (f.kind !== "steps") custom.push([`fields.${f.key}`, [norm(f.key), norm(f.label), ...(f.labelNb ? [norm(f.labelNb)] : [])]]);
  const used = new Set<string>();
  return headers.map((h) => {
    const n = norm(h);
    for (const [target, names] of [...Object.entries(SYNONYMS), ...custom]) {
      if (!used.has(target) && names.includes(n)) {
        used.add(target);
        return target as ImportTarget;
      }
    }
    return "ignore";
  });
}

export interface ImportDefaults {
  /** Used when no type column is mapped or the cell is empty */
  typeId: string;
  phaseId: string | null;
  moduleId: string | null;
}

export interface ImportItem {
  typeId: string;
  title: string;
  state?: string;
  description?: RtDoc | null;
  assignedToId?: string | null;
  moduleId?: string | null;
  phaseId?: string | null;
  priority?: number;
  severity?: number | null;
  tags?: string[];
  dueDate?: string | null;
  parentId?: number | null;
  fields: Record<string, unknown>;
}

export interface ImportRowResult {
  /** 1-based line number in the file, counting the header as line 1 */
  line: number;
  item: ImportItem | null;
  errors: string[];
}

type Cell = string | number | null | undefined;

export function validateImport(rows: Cell[][], mapping: ImportTarget[], meta: Pick<ProjectMeta, "types" | "users" | "modules" | "phases">, defaults: ImportDefaults, existingIds: ReadonlySet<number> = new Set()): ImportRowResult[] {
  const r = makeResolver(meta);
  const col = (target: string) => mapping.indexOf(target as ImportTarget);
  const fieldCols = mapping.map((m, i) => [m, i] as const).filter(([m]) => m.startsWith("fields."));
  const get = (row: Cell[], target: string): string => {
    const i = col(target);
    if (i < 0) return "";
    const v = row[i];
    return v === null || v === undefined ? "" : String(v).trim();
  };

  const results: ImportRowResult[] = [];
  rows.slice(0, IMPORT_MAX_ROWS).forEach((row, idx) => {
    // Skip fully empty rows (common at the end of Excel sheets) but keep line numbers true to the file.
    if (!row.some((c) => c !== null && c !== undefined && String(c).trim() !== "")) return;
    results.push(validateRow(row, idx + 2));
  });
  return results;

  function validateRow(row: Cell[], line: number): ImportRowResult {
    const errors: string[] = [];
    const title = get(row, "title");
    if (!title) errors.push("Title is missing");
    if (title.length > 255) errors.push("Title is longer than 255 characters");

    const typeCell = get(row, "type");
    let type = meta.types.find((t) => t.id === defaults.typeId);
    if (typeCell) {
      const res = r.type(typeCell);
      if (res.ok) type = res.value;
      else errors.push(res.error);
    }
    if (!type) return { line, item: null, errors: [...errors, "No type"] };

    const item: ImportItem = { typeId: type.id, title, fields: {}, phaseId: defaults.phaseId, moduleId: defaults.moduleId };
    const take = <T>(target: string, fn: (v: string) => { ok: true; value: T } | { ok: false; error: string }, set: (v: T) => void) => {
      const v = get(row, target);
      if (col(target) < 0 || !v) return;
      const res = fn(v);
      if (res.ok) set(res.value);
      else errors.push(res.error);
    };
    take("state", (v) => r.state(type, v), (v) => (item.state = v));
    take("assignedTo", r.user, (v) => (item.assignedToId = v));
    take("module", r.module, (v) => (item.moduleId = v));
    take("phase", r.phase, (v) => (item.phaseId = v));
    take("priority", (v) => parseLevel(v, "Priority"), (v) => v !== null && (item.priority = v));
    take("severity", (v) => parseLevel(v, "Severity"), (v) => (item.severity = v));
    take("dueDate", parseDateValue, (v) => (item.dueDate = v));
    take(
      "parentId",
      (v) => {
        const n = Number(v.replace(/^#/, ""));
        if (!Number.isInteger(n) || n <= 0) return { ok: false as const, error: `Parent ID "${v}" is not a number` };
        if (!existingIds.has(n)) return { ok: false as const, error: `Parent #${n} does not exist in this project` };
        return { ok: true as const, value: n };
      },
      (v) => (item.parentId = v),
    );
    const desc = get(row, "description");
    if (desc) item.description = textToDoc(desc);
    const tags = parseTags(get(row, "tags"));
    if (tags.length) item.tags = tags;
    const steps = get(row, "steps");
    if (steps) {
      if (!type.fields.some((f) => f.kind === "steps")) errors.push(`${type.name} has no test steps field`);
      else item.fields.steps = parseSteps(steps);
    }
    for (const [target, i] of fieldCols) {
      const key = target.slice(7);
      const raw = row[i];
      const v = raw === null || raw === undefined ? "" : String(raw).trim();
      if (!v) continue;
      const def = type.fields.find((f) => f.key === key);
      if (!def) continue; // field belongs to another type: ignore for this row
      if (def.kind === "richtext") item.fields[key] = textToDoc(v);
      else if (def.kind === "number") {
        const n = Number(v.replace(",", "."));
        if (Number.isNaN(n)) errors.push(`${def.label} must be a number`);
        else item.fields[key] = n;
      } else if (def.kind === "date") {
        const d = parseDateValue(v);
        if (d.ok) item.fields[key] = d.value;
        else errors.push(`${def.label}: ${d.error}`);
      } else if (def.kind === "select" && def.options?.length) {
        const opt = def.options.find((o) => o.toLowerCase() === v.toLowerCase());
        if (opt) item.fields[key] = opt;
        else errors.push(`${def.label}: "${v}" is not one of ${def.options.join(", ")}`);
      } else item.fields[key] = v;
    }
    return { line, item: errors.length ? null : item, errors };
  }
}
