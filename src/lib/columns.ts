// Column catalogue shared by the work item list, saved queries and Excel/CSV export (pure, unit-tested).
import type { MessageKey } from "./i18n";
import type { FieldDef } from "./fields";
import type { ItemView, ProjectMeta } from "./types";
import { categoryOf } from "./workflow";

/** Fields that can be edited directly in a list cell. */
export type InlineEditKind = "title" | "state" | "assignedTo" | "priority" | "severity" | "phase" | "module" | "dueDate";

export interface ColumnDef {
  key: string;
  /** i18n key for built-in columns; plain label for custom fields */
  labelKey?: MessageKey;
  label?: string;
  labelNb?: string;
  /** Query field used for sorting */
  sort: string;
  edit?: InlineEditKind;
  /** Plain value for export and default rendering */
  value: (item: ItemView, names: ColumnNames) => string | number | null;
  /** Column holds a date (ISO string) */
  isDate?: boolean;
}

export interface ColumnNames {
  typeName: (typeId: string) => string;
  userName: (id: string | null) => string;
  modulePath: (id: string | null) => string;
  phaseName: (id: string | null) => string;
  category: (item: ItemView) => string;
}

export function columnNames(meta: Pick<ProjectMeta, "types" | "users" | "modules" | "phases">): ColumnNames {
  const types = new Map(meta.types.map((t) => [t.id, t]));
  const users = new Map(meta.users.map((u) => [u.id, u.name]));
  const modules = new Map(meta.modules.map((m) => [m.id, m.path]));
  const phases = new Map(meta.phases.map((p) => [p.id, p.name]));
  return {
    typeName: (id) => types.get(id)?.name ?? "",
    userName: (id) => (id ? (users.get(id) ?? "") : ""),
    modulePath: (id) => (id ? (modules.get(id) ?? "") : ""),
    phaseName: (id) => (id ? (phases.get(id) ?? "") : ""),
    category: (item) => {
      const t = types.get(item.typeId);
      return (t && categoryOf({ states: t.states }, item.state)) ?? "";
    },
  };
}

const BUILT_IN: ColumnDef[] = [
  { key: "id", labelKey: "field.id", sort: "id", value: (i) => i.id },
  { key: "type", labelKey: "field.type", sort: "type", value: (i, n) => n.typeName(i.typeId) },
  { key: "title", labelKey: "field.title", sort: "title", edit: "title", value: (i) => i.title },
  { key: "state", labelKey: "field.state", sort: "state", edit: "state", value: (i) => i.state },
  { key: "category", labelKey: "field.category", sort: "category", value: (i, n) => n.category(i) },
  { key: "assignedTo", labelKey: "field.assignedTo", sort: "assignedTo", edit: "assignedTo", value: (i, n) => n.userName(i.assignedToId) },
  { key: "module", labelKey: "field.module", sort: "module", edit: "module", value: (i, n) => n.modulePath(i.moduleId) },
  { key: "phase", labelKey: "field.phase", sort: "phase", edit: "phase", value: (i, n) => n.phaseName(i.phaseId) },
  { key: "priority", labelKey: "field.priority", sort: "priority", edit: "priority", value: (i) => i.priority },
  { key: "severity", labelKey: "field.severity", sort: "severity", edit: "severity", value: (i) => i.severity },
  { key: "tags", labelKey: "field.tags", sort: "tags", value: (i) => i.tags.join(", ") },
  { key: "dueDate", labelKey: "field.dueDate", sort: "dueDate", edit: "dueDate", isDate: true, value: (i) => i.dueDate },
  { key: "parent", labelKey: "field.parent", sort: "parentId", value: (i) => i.parentId },
  { key: "children", labelKey: "field.children", sort: "childCount", value: (i) => (i.childTotal ? `${i.childDone}/${i.childTotal}` : "") },
  { key: "comments", labelKey: "field.comments", sort: "commentCount", value: (i) => i.commentCount },
  { key: "createdBy", labelKey: "field.createdBy", sort: "createdBy", value: (i, n) => n.userName(i.createdById) },
  { key: "createdAt", labelKey: "field.createdAt", sort: "createdAt", isDate: true, value: (i) => i.createdAt },
  { key: "changedAt", labelKey: "field.changedAt", sort: "changedAt", isDate: true, value: (i) => i.changedAt },
  { key: "stateChangedAt", labelKey: "field.stateChangedAt", sort: "stateChangedAt", isDate: true, value: (i) => i.stateChangedAt },
];

export const DEFAULT_COLUMNS = ["id", "type", "title", "state", "assignedTo", "module", "phase", "priority", "severity", "dueDate", "changedAt"];

function customValue(def: FieldDef) {
  return (i: ItemView): string | number | null => {
    const v = i.fields[def.key];
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v;
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  };
}

/** All columns available in a project: built-ins plus scalar custom fields (rich text and steps are left out). */
export function columnCatalogue(meta: Pick<ProjectMeta, "types">): ColumnDef[] {
  const custom = new Map<string, FieldDef>();
  for (const t of meta.types) for (const f of t.fields) if (f.kind !== "richtext" && f.kind !== "steps" && !custom.has(f.key)) custom.set(f.key, f);
  return [
    ...BUILT_IN,
    ...[...custom.values()].map((f) => ({
      key: `fields.${f.key}`,
      label: f.label,
      labelNb: f.labelNb,
      sort: `fields.${f.key}`,
      isDate: f.kind === "date",
      value: customValue(f),
    })),
  ];
}

/** Resolve requested keys against the catalogue; unknown keys are dropped, an empty result falls back to defaults. */
export function resolveColumns(keys: string[] | undefined, catalogue: ColumnDef[]): ColumnDef[] {
  const byKey = new Map(catalogue.map((c) => [c.key, c]));
  const picked = (keys ?? []).map((k) => byKey.get(k)).filter((c): c is ColumnDef => !!c);
  if (picked.length) return picked;
  return DEFAULT_COLUMNS.map((k) => byKey.get(k)!).filter(Boolean);
}

export function columnsToParam(keys: string[]): string {
  return keys.join(",");
}

export function columnsFromParam(v: string | null | undefined): string[] | undefined {
  const list = (v ?? "").split(",").filter(Boolean);
  return list.length ? list : undefined;
}

/** Export cell value: dates as yyyy-mm-dd, everything else as-is. */
export function exportValue(col: ColumnDef, item: ItemView, names: ColumnNames): string | number | null {
  const v = col.value(item, names);
  if (col.isDate && typeof v === "string") return v.slice(0, 10);
  return v;
}

export function exportRows(items: ItemView[], cols: ColumnDef[], names: ColumnNames): (string | number | null)[][] {
  return items.map((i) => cols.map((c) => exportValue(c, i, names)));
}

/**
 * Neutralise spreadsheet formula injection in CSV: cells starting with = + - @ (or tab/CR) are prefixed with an apostrophe.
 * Numbers are left alone, so negative numbers stay numeric.
 */
export function csvSafe(v: string | number | null): string | number {
  if (v === null) return "";
  if (typeof v === "number") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Safe file name: keeps letters (incl. æøå), digits, dash and underscore. */
export function exportFileName(base: string, ext: "xlsx" | "csv", date = new Date()): string {
  const clean = base.normalize("NFC").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "work-items";
  return `${clean}-${date.toISOString().slice(0, 10)}.${ext}`;
}
