"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemView } from "@/lib/types";
import { BULK_CREATE_MAX, DEFAULT_TITLE_PATTERN, expandBulkCreate } from "@/lib/bulkcreate";
import { bulkCreateTestTasks } from "@/server/actions/items";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";
import { UserSelect } from "../ui/UserSelect";

const PREVIEW_ROWS = 8;

/** Modal for creating test tasks for every title × module × phase combination. */
export function BulkCreateDialog({ items, onClose, onCreated }: { items: ItemView[]; onClose: () => void; onCreated: () => void }) {
  const t = useT();
  const toast = useToast();
  const { meta, moduleById, phaseById } = useProject();
  const ref = useRef<HTMLDialogElement>(null);
  const testType = meta.types.find((x) => x.key === "TEST_TASK");
  const templates = useMemo(() => items.filter((i) => i.typeId === testType?.id).sort((a, b) => a.title.localeCompare(b.title)), [items, testType]);

  const [titles, setTitles] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [phaseIds, setPhaseIds] = useState<string[]>([]);
  const [pattern, setPattern] = useState(DEFAULT_TITLE_PATTERN);
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [skipExisting, setSkipExisting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const template = templates.find((x) => x.id === templateId);
  const titleLines = useMemo(() => titles.split("\n").filter((l) => l.trim()), [titles]);
  const rows = useMemo(
    () =>
      expandBulkCreate(
        { titles: titleLines.length ? titleLines : template ? [template.title] : [], moduleIds, phaseIds, pattern },
        { module: (id) => moduleById.get(id)?.name ?? "", phase: (id) => phaseById.get(id)?.name ?? "" },
      ),
    [titleLines, template, moduleIds, phaseIds, pattern, moduleById, phaseById],
  );
  const tooMany = rows.length > BULK_CREATE_MAX;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rows.length === 0 || tooMany) return;
    setBusy(true);
    const res = await bulkCreateTestTasks({ projectId: meta.id, titles: titleLines, moduleIds, phaseIds, pattern, templateId, assignedToId, skipExisting });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast(t("bulkCreate.created", { created: res.data.created, skipped: res.data.skipped }), "success");
    onCreated();
    onClose();
  };

  const fieldset = "rounded border border-line p-2";
  return (
    <dialog
      ref={ref}
      aria-labelledby="bulk-create-title"
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="m-auto w-[min(760px,95vw)] rounded-lg p-0 shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <div className="border-b border-line px-4 py-3">
          <h2 id="bulk-create-title" className="text-lg font-semibold">
            {t("bulkCreate.title")}
          </h2>
          <p className="text-sm text-ink-muted">{t("bulkCreate.intro")}</p>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-4 py-3 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label htmlFor="bc-template" className="mb-1 block text-sm font-semibold">
                {t("bulkCreate.template")}
              </label>
              <select id="bc-template" className="input" value={templateId ?? ""} onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t("bulkCreate.noTemplate")}</option>
                {templates.map((x) => (
                  <option key={x.id} value={x.id}>
                    #{x.id} {x.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bc-titles" className="mb-1 block text-sm font-semibold">
                {t("bulkCreate.titles")}
              </label>
              <textarea id="bc-titles" className="input min-h-28 font-mono text-xs" value={titles} onChange={(e) => setTitles(e.target.value)} aria-describedby="bc-titles-hint" />
              <p id="bc-titles-hint" className="text-xs text-ink-muted">
                {t("bulkCreate.titlesHint")}
              </p>
            </div>
            <div>
              <label htmlFor="bc-pattern" className="mb-1 block text-sm font-semibold">
                {t("bulkCreate.pattern")}
              </label>
              <input id="bc-pattern" className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-describedby="bc-pattern-hint" />
              <p id="bc-pattern-hint" className="text-xs text-ink-muted">
                {t("bulkCreate.patternHint")}
              </p>
            </div>
            <div>
              <label htmlFor="bc-assignee" className="mb-1 block text-sm font-semibold">
                {t("field.assignedTo")}
              </label>
              <UserSelect id="bc-assignee" users={meta.users} value={assignedToId} onChange={setAssignedToId} unassignedLabel={t("common.unassigned")} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
              {t("bulkCreate.skipExisting")}
            </label>
          </div>
          <div className="space-y-3">
            <fieldset className={fieldset}>
              <legend className="px-1 text-sm font-semibold">{t("bulkCreate.modules")}</legend>
              <div className="max-h-44 overflow-y-auto">
                {meta.modules.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <input type="checkbox" checked={moduleIds.includes(m.id)} onChange={() => toggle(moduleIds, setModuleIds, m.id)} />
                    {m.path}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className={fieldset}>
              <legend className="px-1 text-sm font-semibold">{t("bulkCreate.phases")}</legend>
              {meta.phases.map((p) => (
                <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" checked={phaseIds.includes(p.id)} onChange={() => toggle(phaseIds, setPhaseIds, p.id)} />
                  {p.name}
                </label>
              ))}
            </fieldset>
            <section aria-labelledby="bc-preview" className={fieldset}>
              <h3 id="bc-preview" className="text-sm font-semibold">
                {t("bulkCreate.preview")}
              </h3>
              <p className={`text-sm ${tooMany ? "font-semibold text-danger" : "text-ink-muted"}`} aria-live="polite">
                {tooMany ? t("bulkCreate.tooMany", { max: BULK_CREATE_MAX }) : t("bulkCreate.count", { count: rows.length })}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <li key={i} className="truncate">
                    {r.title}
                    <span className="text-ink-muted">
                      {r.moduleId ? ` · ${moduleById.get(r.moduleId)?.name}` : ""}
                      {r.phaseId ? ` · ${phaseById.get(r.phaseId)?.name}` : ""}
                    </span>
                  </li>
                ))}
                {rows.length > PREVIEW_ROWS && <li className="text-ink-muted">{t("bulkCreate.more", { count: rows.length - PREVIEW_ROWS })}</li>}
              </ul>
            </section>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || rows.length === 0 || tooMany}>
            {busy ? t("common.saving") : `${t("bulkCreate.submit")} (${rows.length})`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
