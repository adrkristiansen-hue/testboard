"use client";

import { useMemo, useState } from "react";
import type { ItemView } from "@/lib/types";
import { bulkAddTags, bulkUpdateItems } from "@/server/actions/items";
import type { ItemPatch } from "@/server/workitems";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";

/** Toolbar shown above the list while rows are selected. Each control applies immediately to all selected items. */
export function BulkBar({ selected, onClear, onDone }: { selected: ItemView[]; onClear: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { meta, typeById } = useProject();
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState("");

  // Only offer states that exist on every selected item's type.
  const commonStates = useMemo(() => {
    const typeIds = [...new Set(selected.map((i) => i.typeId))];
    const lists = typeIds.map((id) => typeById.get(id)?.states.map((s) => s.name) ?? []);
    return lists.length ? lists.reduce((acc, l) => acc.filter((s) => l.includes(s))) : [];
  }, [selected, typeById]);

  const report = (res: Awaited<ReturnType<typeof bulkUpdateItems>>) => {
    if (!res.ok) return toast(res.error, "error");
    toast(t("bulk.result", { updated: res.data.updated }), "success");
    if (res.data.errors.length) toast(t("bulk.errors", { count: res.data.errors.length, first: res.data.errors[0] }), "error");
    onDone();
  };

  const apply = async (patch: ItemPatch) => {
    setBusy(true);
    try {
      report(await bulkUpdateItems(selected.map((i) => i.id), patch));
    } finally {
      setBusy(false);
    }
  };

  const addTag = async () => {
    const v = tag.trim();
    if (!v) return;
    setBusy(true);
    try {
      report(await bulkAddTags(selected.map((i) => i.id), [v]));
      setTag("");
    } finally {
      setBusy(false);
    }
  };

  const sel = "rounded border border-line-strong bg-white px-2 py-1 text-sm disabled:opacity-50";
  // Each select resets to its placeholder after applying.
  const pick = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    e.target.value = "";
    if (v) fn(v);
  };

  return (
    <div role="toolbar" aria-label={t("list.bulkEdit")} className="flex flex-wrap items-center gap-2 border-b border-brand/30 bg-brand-soft px-4 py-2" aria-busy={busy}>
      <span className="text-sm font-semibold" aria-live="polite">
        {busy ? t("bulk.working", { count: selected.length }) : t("list.selected", { count: selected.length })}
      </span>
      <select aria-label={t("bulk.assign")} className={sel} disabled={busy} defaultValue="" onChange={pick((v) => apply({ assignedToId: v === "__none" ? null : v }))}>
        <option value="">{t("bulk.assign")}</option>
        <option value="__none">{t("common.unassigned")}</option>
        {meta.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <select aria-label={t("bulk.state")} className={sel} disabled={busy || commonStates.length === 0} defaultValue="" onChange={pick((v) => apply({ state: v }))}>
        <option value="">{t("bulk.state")}</option>
        {commonStates.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select aria-label={t("bulk.priority")} className={sel} disabled={busy} defaultValue="" onChange={pick((v) => apply({ priority: Number(v) }))}>
        <option value="">{t("bulk.priority")}</option>
        {[1, 2, 3, 4].map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select aria-label={t("bulk.phase")} className={sel} disabled={busy} defaultValue="" onChange={pick((v) => apply({ phaseId: v === "__none" ? null : v }))}>
        <option value="">{t("bulk.phase")}</option>
        <option value="__none">{t("common.none")}</option>
        {meta.phases.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select aria-label={t("bulk.module")} className={sel} disabled={busy} defaultValue="" onChange={pick((v) => apply({ moduleId: v === "__none" ? null : v }))}>
        <option value="">{t("bulk.module")}</option>
        <option value="__none">{t("common.none")}</option>
        {meta.modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.path}
          </option>
        ))}
      </select>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          void addTag();
        }}
      >
        <input aria-label={t("bulk.addTag")} placeholder={t("bulk.addTag")} className={`${sel} w-32`} value={tag} maxLength={50} disabled={busy} onChange={(e) => setTag(e.target.value)} />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !tag.trim()}>
          {t("common.add")}
        </button>
      </form>
      <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={onClear} disabled={busy}>
        {t("bulk.clear")}
      </button>
    </div>
  );
}
