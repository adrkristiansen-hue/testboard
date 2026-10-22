"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import type { ScriptSummary } from "@/lib/testrun-types";
import { planBlock } from "@/lib/testscripts";
import { planRuns, type PlanResult } from "@/server/actions/testscripts";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { useToast } from "../ui/Toast";

/** Plan one test run per selected script × tester in a phase. */
export function PlanDialog({ scripts, onClose, onPlanned }: { scripts: ScriptSummary[]; onClose: () => void; onPlanned: () => void }) {
  const t = useT();
  const toast = useToast();
  const { user } = useSessionUser();
  const { meta, can } = useProject();
  const ref = useRef<HTMLDialogElement>(null);
  const [phaseId, setPhaseId] = useState(meta.phases[meta.phases.length - 1]?.id ?? "");
  const [testerIds, setTesterIds] = useState<string[]>(can("items.assign") ? [] : [user.id]);
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const phase = meta.phases.find((p) => p.id === phaseId) ?? null;
  const blocked = useMemo(
    () => scripts.map((s) => ({ s, block: planBlock({ status: s.status, stepCount: s.stepCount }, phase ? { requireApprovedScripts: !!phase.requireApprovedScripts } : null) })).filter((x) => x.block),
    [scripts, phase],
  );
  const plannable = scripts.length - blocked.length;
  const testers = can("items.assign") ? meta.users : meta.users.filter((u) => u.id === user.id);
  const total = plannable * testerIds.length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phaseId || testerIds.length === 0 || total === 0) return;
    setBusy(true);
    const res = await planRuns({ projectId: meta.id, scriptIds: scripts.map((s) => s.id), phaseId, testerIds, dueDate: dueDate || null });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setResult(res.data);
    toast(t("ts.planned", { count: res.data.created }), "success");
    onPlanned();
  };

  return (
    <dialog ref={ref} aria-labelledby="plan-title" onClose={onClose} onCancel={(e) => busy && e.preventDefault()} className="m-auto w-[min(640px,95vw)] rounded-lg p-0 shadow-2xl backdrop:bg-black/40">
      <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <div className="border-b border-line px-4 py-3">
          <h2 id="plan-title" className="text-lg font-semibold">
            {t("ts.planTitle", { count: scripts.length })}
          </h2>
          <p className="text-sm text-ink-muted">{t("ts.planIntro")}</p>
        </div>
        {result ? (
          <div className="space-y-2 overflow-y-auto px-4 py-3 text-sm">
            <p role="status" className="font-semibold">
              {t("ts.planned", { count: result.created })}
            </p>
            {result.skipped.length > 0 && (
              <>
                <p>{t("ts.skipped", { count: result.skipped.length })}</p>
                <ul className="list-disc pl-5 text-ink-muted">
                  {result.skipped.slice(0, 30).map((s, i) => (
                    <li key={i}>
                      {s.key}
                      {s.tester ? ` · ${s.tester}` : ""}: {t(`ts.block.${s.reason}` as MessageKey)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto px-4 py-3">
            <div>
              <label htmlFor="plan-phase" className="mb-1 block text-sm font-semibold">
                {t("field.phase")}
              </label>
              <select id="plan-phase" className="input" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} required>
                {meta.phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.requireApprovedScripts ? ` – ${t("ts.approvedOnly")}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {blocked.length > 0 && (
              <div className="rounded border border-warn bg-warn-soft p-2 text-sm text-warn" role="note">
                <p className="font-semibold">{t("ts.wontPlan", { count: blocked.length })}</p>
                <ul className="list-disc pl-5">
                  {blocked.slice(0, 10).map(({ s, block }) => (
                    <li key={s.id}>
                      {s.key} {s.title}: {t(`ts.block.${block}` as MessageKey)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <fieldset className="rounded border border-line p-2">
              <legend className="px-1 text-sm font-semibold">{t("ts.testers")}</legend>
              <p className="mb-1 text-xs text-ink-muted">{t("ts.testersHint")}</p>
              <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                {testers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={testerIds.includes(u.id)} onChange={() => setTesterIds((cur) => (cur.includes(u.id) ? cur.filter((x) => x !== u.id) : [...cur, u.id]))} />
                    {u.name}
                    {u.organization && <span className="text-xs text-ink-muted">{u.organization}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="plan-due" className="mb-1 block text-sm font-semibold">
                {t("field.dueDate")} <span className="font-normal text-ink-muted">({t("ts.optional")})</span>
              </label>
              <input id="plan-due" type="date" className="input w-auto" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <p className="text-sm" aria-live="polite">
              {t("ts.planSummary", { count: total, scripts: plannable, testers: testerIds.length })}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>
            {result ? t("common.close") : t("common.cancel")}
          </button>
          {!result && (
            <button type="submit" className="btn btn-primary" disabled={busy || total === 0}>
              {t("ts.planSubmit", { count: total })}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
