"use client";

import { DEFAULT_COLUMNS, type ColumnDef } from "@/lib/columns";
import { useI18n } from "../I18nProvider";
import { Popover } from "../ui/Popover";
import { columnLabel } from "./ItemTable";

/** Pick and order list columns. Selected columns can be moved up/down; the rest are listed below. */
export function ColumnChooser({ catalogue, value, onChange }: { catalogue: ColumnDef[]; value: string[]; onChange: (keys: string[]) => void }) {
  const { t, locale } = useI18n();
  const byKey = new Map(catalogue.map((c) => [c.key, c]));
  const selected = value.filter((k) => byKey.has(k));
  const available = catalogue.filter((c) => !selected.includes(c.key));
  const move = (i: number, d: -1 | 1) => {
    const next = [...selected];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const label = (k: string) => columnLabel(byKey.get(k)!, t, locale);

  return (
    <Popover label={t("list.chooseColumns")} triggerClassName="btn btn-ghost btn-sm" trigger={<>{t("list.columns")} ▾</>}>
      {() => (
        <div className="max-h-[70vh] w-72 overflow-y-auto p-1 text-sm">
          <ul aria-label={t("list.columns")}>
            {selected.map((k, i) => (
              <li key={k} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-gray-50">
                <label className="flex flex-1 items-center gap-2">
                  <input type="checkbox" checked disabled={selected.length === 1} onChange={() => onChange(selected.filter((x) => x !== k))} />
                  {label(k)}
                </label>
                <button type="button" className="icon-btn h-6 w-6" aria-label={`${t("common.moveUp")}: ${label(k)}`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn h-6 w-6" aria-label={`${t("common.moveDown")}: ${label(k)}`} disabled={i === selected.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
              </li>
            ))}
          </ul>
          <div className="my-1 border-t border-line" />
          <ul>
            {available.map((c) => (
              <li key={c.key} className="rounded px-2 py-0.5 hover:bg-gray-50">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={false} onChange={() => onChange([...selected, c.key])} />
                  {columnLabel(c, t, locale)}
                </label>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-2 pt-1">
            <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => onChange([...DEFAULT_COLUMNS])}>
              {t("list.resetColumns")}
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
