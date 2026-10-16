"use client";

import { OPS, QUERY_FIELDS, isGroup, type Clause, type Condition, type Group, type Op } from "@/lib/query";
import { STATE_CATEGORIES } from "@/lib/workflow";
import type { MessageKey } from "@/lib/i18n";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";

const OP_LABELS: Record<Op, string> = {
  eq: "=",
  neq: "≠",
  in: "in",
  notIn: "not in",
  contains: "contains",
  notContains: "does not contain",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  under: "under",
};

const FIELD_LABEL_KEYS: Record<string, MessageKey> = {
  id: "field.id",
  title: "field.title",
  keyword: "field.keyword",
  type: "field.type",
  state: "field.state",
  category: "field.category",
  assignedTo: "field.assignedTo",
  createdBy: "field.createdBy",
  module: "field.module",
  phase: "field.phase",
  priority: "field.priority",
  severity: "field.severity",
  tags: "field.tags",
  dueDate: "field.dueDate",
  createdAt: "field.createdAt",
  changedAt: "field.changedAt",
  commentCount: "field.comments",
  childCount: "field.children",
  overdue: "field.overdue",
  parentId: "field.parent",
};

function opsFor(field: string): Op[] {
  const ft = QUERY_FIELDS[field];
  switch (ft) {
    case "number":
    case "date":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"];
    case "boolean":
      return ["eq"];
    case "module":
      return ["eq", "neq", "under", "in", "notIn", "isEmpty", "isNotEmpty"];
    case "user":
    case "phase":
    case "type":
    case "state":
    case "category":
      return ["eq", "neq", "in", "notIn", "isEmpty", "isNotEmpty"];
    case "tags":
      return ["eq", "neq", "in", "notIn", "contains", "isEmpty", "isNotEmpty"];
    default:
      return ["contains", "notContains", "eq", "neq", "isEmpty", "isNotEmpty"];
  }
}

export function ConditionEditor({ value, onChange, allowGroups = true, depth = 0 }: { value: Group; onChange: (g: Group) => void; allowGroups?: boolean; depth?: number }) {
  const t = useT();
  const update = (i: number, c: Clause) => onChange({ ...value, clauses: value.clauses.map((x, j) => (j === i ? c : x)) });
  const remove = (i: number) => onChange({ ...value, clauses: value.clauses.filter((_, j) => j !== i) });
  return (
    <div className={`flex flex-col gap-1.5 ${depth > 0 ? "rounded border border-dashed border-line-strong p-2" : ""}`}>
      {value.clauses.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink-muted">Match</span>
          <select aria-label="Logic" className="input w-auto py-0.5 text-xs" value={value.logic} onChange={(e) => onChange({ ...value, logic: e.target.value as "and" | "or" })}>
            <option value="and">all (AND)</option>
            <option value="or">any (OR)</option>
          </select>
        </div>
      )}
      {value.clauses.map((c, i) =>
        isGroup(c) ? (
          <div key={i} className="flex items-start gap-1">
            <div className="flex-1">
              <ConditionEditor value={c} onChange={(g) => update(i, g)} allowGroups={false} depth={depth + 1} />
            </div>
            <button type="button" className="icon-btn" aria-label={t("common.remove")} onClick={() => remove(i)}>
              ✕
            </button>
          </div>
        ) : (
          <ConditionRow key={i} cond={c} onChange={(nc) => update(i, nc)} onRemove={() => remove(i)} />
        ),
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...value, clauses: [...value.clauses, { field: "priority", op: "eq", value: 1 }] })}>
          + {t("settings.addCondition")}
        </button>
        {allowGroups && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...value, clauses: [...value.clauses, { logic: "or", clauses: [] }] })}>
            + ( … )
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({ cond, onChange, onRemove }: { cond: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  const t = useT();
  const { meta } = useProject();
  const fieldOptions = [
    ...Object.keys(QUERY_FIELDS).map((f) => ({ value: f, label: FIELD_LABEL_KEYS[f] ? t(FIELD_LABEL_KEYS[f]) : f })),
    ...[...new Map(meta.types.flatMap((ty) => ty.fields).map((f) => [f.key, f])).values()].filter((f) => f.kind !== "steps" && f.kind !== "richtext").map((f) => ({ value: `fields.${f.key}`, label: f.label })),
  ];
  const ops = opsFor(cond.field);
  const multi = cond.op === "in" || cond.op === "notIn";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select aria-label="Field" className="input w-auto py-0.5" value={cond.field} onChange={(e) => onChange({ field: e.target.value, op: opsFor(e.target.value)[0], value: undefined })}>
        {fieldOptions.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select aria-label="Operator" className="input w-auto py-0.5" value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as Op, value: e.target.value === "in" || e.target.value === "notIn" ? [] : cond.value })}>
        {(ops.includes(cond.op) ? ops : [cond.op, ...ops]).filter((o) => OPS.includes(o)).map((o) => (
          <option key={o} value={o}>
            {OP_LABELS[o]}
          </option>
        ))}
      </select>
      {cond.op !== "isEmpty" && cond.op !== "isNotEmpty" && <ValueInput field={cond.field} multi={multi} value={cond.value} onChange={(v) => onChange({ ...cond, value: v })} />}
      <button type="button" className="icon-btn" aria-label={t("common.remove")} onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

function ValueInput({ field, multi, value, onChange }: { field: string; multi: boolean; value: unknown; onChange: (v: unknown) => void }) {
  const t = useT();
  const { meta } = useProject();
  const ft = QUERY_FIELDS[field];
  let options: { value: string | number; label: string }[] | null = null;
  if (ft === "user") options = [{ value: "@me", label: "@me" }, ...meta.users.map((u) => ({ value: u.id, label: u.name }))];
  else if (ft === "module") options = meta.modules.map((m) => ({ value: m.id, label: m.path }));
  else if (ft === "phase") options = meta.phases.map((p) => ({ value: p.id, label: p.name }));
  else if (ft === "type") options = meta.types.map((ty) => ({ value: ty.key, label: ty.name }));
  else if (ft === "state") options = [...new Set(meta.types.flatMap((ty) => ty.states.map((s) => s.name)))].map((s) => ({ value: s, label: s }));
  else if (ft === "category") options = STATE_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}` as MessageKey) }));
  else if (field === "priority" || field === "severity") options = [1, 2, 3, 4].map((p) => ({ value: p, label: String(p) }));
  else if (ft === "boolean") options = [{ value: "true", label: t("common.yes") }, { value: "false", label: t("common.no") }];
  else if (field.startsWith("fields.")) {
    const def = meta.types.flatMap((ty) => ty.fields).find((f) => f.key === field.slice(7));
    if (def?.options) options = def.options.map((o) => ({ value: o, label: o }));
  }

  const isNum = ft === "number";
  const coerce = (s: string): unknown => (isNum || field === "priority" || field === "severity" ? (s === "" ? null : Number(s)) : ft === "boolean" ? s === "true" : s);

  if (options && multi) {
    const sel = Array.isArray(value) ? value.map(String) : [];
    return (
      <select
        multiple
        aria-label="Values"
        className="input h-20 w-auto min-w-40 py-0.5"
        value={sel}
        onChange={(e) => onChange([...e.target.selectedOptions].map((o) => coerce(o.value)))}
      >
        {options.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (options) {
    return (
      <select aria-label="Value" className="input w-auto min-w-32 py-0.5" value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(coerce(e.target.value))}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (multi) {
    return <input aria-label="Values (comma separated)" className="input w-48 py-0.5" value={Array.isArray(value) ? value.join(", ") : ""} onChange={(e) => onChange(e.target.value.split(",").map((s) => coerce(s.trim())).filter((v) => v !== "" && v !== null))} placeholder="a, b" />;
  }
  return (
    <input
      aria-label="Value"
      className="input w-40 py-0.5"
      type={isNum ? "number" : "text"}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => onChange(coerce(e.target.value))}
      placeholder={ft === "date" ? "2026-10-01 / @today-7" : ""}
    />
  );
}
