"use client";

import { useRef, useState } from "react";
import { EMPTY_FILTER, isFilterActive, UNASSIGNED, type FilterState } from "@/lib/filters";
import type { MessageKey } from "@/lib/i18n";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { Popover } from "../ui/Popover";

interface Option {
  value: string;
  label: string;
}

function MultiSelect({ label, options, selected, onChange }: { label: string; options: Option[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <Popover
      label={label}
      triggerClassName={`btn btn-sm ${selected.length ? "btn-secondary border-brand text-brand-dark" : "btn-ghost"}`}
      trigger={
        <>
          {label}
          {selected.length > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] text-white">{selected.length}</span>}
          <span aria-hidden="true">▾</span>
        </>
      }
    >
      {() => (
        <fieldset className="max-h-80 w-64 overflow-y-auto p-1">
          <legend className="sr-only">{label}</legend>
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-brand-soft">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {options.length === 0 && <div className="px-2 py-1 text-sm text-ink-muted">—</div>}
        </fieldset>
      )}
    </Popover>
  );
}

export function FilterBar({
  value,
  onChange,
  allTags,
  shown,
  total,
  searchRef,
}: {
  value: FilterState;
  onChange: (f: FilterState) => void;
  allTags: string[];
  shown: number;
  total: number;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const t = useT();
  const { meta } = useProject();
  const [kw, setKw] = useState(value.keyword);
  const [lastKeyword, setLastKeyword] = useState(value.keyword);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Sync when the keyword is changed from outside (e.g. "Clear filters").
  if (value.keyword !== lastKeyword) {
    setLastKeyword(value.keyword);
    setKw(value.keyword);
  }

  const states = [...new Set(meta.types.flatMap((ty) => ty.states.map((s) => s.name)))];

  return (
    <div role="search" className="flex flex-wrap items-center gap-1.5">
      <input
        ref={searchRef}
        type="search"
        aria-label={t("filter.placeholder")}
        placeholder={t("filter.placeholder")}
        className="input max-w-60 py-1"
        value={kw}
        onChange={(e) => {
          const v = e.target.value;
          setKw(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange({ ...value, keyword: v }), 150);
        }}
      />
      <MultiSelect label={t("filter.types")} options={meta.types.map((ty) => ({ value: ty.key, label: ty.name }))} selected={value.types} onChange={(types) => onChange({ ...value, types })} />
      <MultiSelect
        label={t("filter.assignees")}
        options={[{ value: UNASSIGNED, label: t("common.unassigned") }, ...meta.users.map((u) => ({ value: u.id, label: u.name }))]}
        selected={value.assignees}
        onChange={(assignees) => onChange({ ...value, assignees })}
      />
      <MultiSelect label={t("filter.modules")} options={meta.modules.map((m) => ({ value: m.id, label: m.path }))} selected={value.modules} onChange={(modules) => onChange({ ...value, modules })} />
      <MultiSelect label={t("filter.phases")} options={meta.phases.map((p) => ({ value: p.id, label: p.name }))} selected={value.phases} onChange={(phases) => onChange({ ...value, phases })} />
      <MultiSelect label={t("filter.states")} options={states.map((s) => ({ value: s, label: s }))} selected={value.states} onChange={(s) => onChange({ ...value, states: s })} />
      <MultiSelect label={t("filter.tags")} options={allTags.map((s) => ({ value: s, label: s }))} selected={value.tags} onChange={(tags) => onChange({ ...value, tags })} />
      <MultiSelect
        label={t("filter.priorities")}
        options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: t(`priority.${p}` as MessageKey) }))}
        selected={value.priorities.map(String)}
        onChange={(p) => onChange({ ...value, priorities: p.map(Number) })}
      />
      {isFilterActive(value) && (
        <>
          <button type="button" className="btn btn-ghost btn-sm text-brand" onClick={() => onChange(EMPTY_FILTER)}>
            ✕ {t("filter.clear")}
          </button>
          <span className="text-xs text-ink-muted" aria-live="polite">
            {t("filter.showing", { shown, total })}
          </span>
        </>
      )}
    </div>
  );
}
