"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TestStep } from "@/lib/fields";
import type { ScriptView } from "@/lib/testrun-types";
import { DEFAULT_SCRIPT_INPUTS, sameContent, type ScriptStatus } from "@/lib/testscripts";
import { formatDate, formatDateTime } from "@/lib/format";
import { clearScriptReview, deleteScript, saveScript, setScriptStatus } from "@/server/actions/testscripts";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useToast } from "../ui/Toast";
import { TagInput } from "../ui/TagInput";
import { StateDot } from "../ui/TypeIcon";
import { StepsEditor } from "../item/StepsEditor";
import { StatusBadge } from "./StatusBadge";

interface Draft {
  title: string;
  moduleId: string | null;
  role: string;
  preconditions: string;
  testData: string;
  inputs: string[];
  steps: TestStep[];
}

const emptyDraft = (): Draft => ({ title: "", moduleId: null, role: "", preconditions: "", testData: "", inputs: [...DEFAULT_SCRIPT_INPUTS], steps: [{ action: "", expected: "" }] });

export function ScriptEditor({ script }: { script: ScriptView | null }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { meta, can, phaseById, userById } = useProject();
  const initial: Draft = script
    ? { title: script.title, moduleId: script.moduleId, role: script.role, preconditions: script.preconditions, testData: script.testData, inputs: script.inputs, steps: script.steps }
    : emptyDraft();
  const [draft, setDraft] = useState<Draft>(initial);
  const [pending, start] = useTransition();
  const editable = can("scripts.edit") && script?.status !== "RETIRED";
  const dirty = !sameContent(initial, draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const testType = meta.types.find((x) => x.key === "TEST_TASK");

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error ?? t("common.error"), "error");
      done?.();
      router.refresh();
    });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (script?.status === "APPROVED" && dirty && !confirm(t("ts.confirmNewVersion", { version: script.version + 1 }))) return;
    start(async () => {
      const res = await saveScript(meta.id, { id: script?.id, ...draft });
      if (!res.ok) return toast(res.error, "error");
      toast(t("common.saved"), "success");
      if (!script) router.push(`/p/${meta.id}/scripts/${res.data.id}`);
      else router.refresh();
    });
  };

  const status = (s: ScriptStatus) => act(() => setScriptStatus(script!.id, s));

  return (
    <main className="w-full max-w-5xl space-y-4 p-4">
      <div>
        <Link href={`/p/${meta.id}/scripts`} className="text-sm text-brand hover:underline">
          ← {t("nav.scripts")}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">
          {script ? (
            <>
              <span className="text-ink-muted">{script.key}</span> {script.title}
            </>
          ) : (
            t("ts.new")
          )}
        </h1>
        {script && (
          <>
            <StatusBadge status={script.status} />
            <span className="text-sm text-ink-muted">
              {t("ts.version", { version: script.version })}
              {script.approvedBy && script.approvedAt && ` · ${t("ts.approvedBy", { name: script.approvedBy, date: formatDate(script.approvedAt, locale) })}`}
            </span>
          </>
        )}
      </div>

      {script && (
        <div className="flex flex-wrap gap-2">
          {script.status === "DRAFT" && can("scripts.approve") && (
            <button type="button" className="btn btn-primary btn-sm" disabled={pending || dirty} title={dirty ? t("ts.saveFirst") : undefined} onClick={() => status("APPROVED")}>
              ✓ {t("ts.approve")}
            </button>
          )}
          {script.status === "APPROVED" && can("scripts.edit") && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => status("DRAFT")}>
              {t("ts.backToDraft")}
            </button>
          )}
          {script.status !== "RETIRED" && can("scripts.edit") && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => confirm(t("ts.confirmRetire")) && status("RETIRED")}>
              {t("ts.retire")}
            </button>
          )}
          {script.status === "RETIRED" && can("scripts.edit") && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => status("DRAFT")}>
              {t("ts.reactivate")}
            </button>
          )}
          {script.runs.length === 0 && can("scripts.edit") && (
            <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={pending} onClick={() => confirm(t("common.confirmDelete")) && act(() => deleteScript(script.id), () => router.push(`/p/${meta.id}/scripts`))}>
              {t("common.delete")}
            </button>
          )}
        </div>
      )}

      {script?.reviewNote && (
        <div role="note" className="rounded border border-warn bg-warn-soft p-3 text-sm">
          <p className="font-semibold text-warn">⚠ {t("ts.reviewRequested", { name: script.reviewBy ?? "", date: script.reviewAt ? formatDateTime(script.reviewAt, locale) : "" })}</p>
          <p className="mt-1 whitespace-pre-wrap">{script.reviewNote}</p>
          {can("scripts.edit") && (
            <button type="button" className="btn btn-secondary btn-sm mt-2" disabled={pending} onClick={() => act(() => clearScriptReview(script.id))}>
              {t("ts.markReviewed")}
            </button>
          )}
        </div>
      )}

      {!can("scripts.edit") && <p className="text-sm text-ink-muted">{t("ts.readOnly")}</p>}

      <form onSubmit={save} className="card-panel space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="ts-title" className="label">
              {t("field.title")}
            </label>
            <input id="ts-title" className="input" required maxLength={200} readOnly={!editable} value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <label htmlFor="ts-module" className="label">
              {t("field.module")}
            </label>
            <select id="ts-module" className="input" disabled={!editable} value={draft.moduleId ?? ""} onChange={(e) => set("moduleId", e.target.value || null)}>
              <option value="">{t("common.noModule")}</option>
              {meta.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.path}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ts-role" className="label">
              {t("ts.role")}
            </label>
            <input id="ts-role" className="input" placeholder={t("ts.rolePlaceholder")} readOnly={!editable} value={draft.role} onChange={(e) => set("role", e.target.value)} />
          </div>
          <div>
            <label htmlFor="ts-pre" className="label">
              {t("ts.preconditions")}
            </label>
            <textarea id="ts-pre" className="input min-h-20" readOnly={!editable} value={draft.preconditions} onChange={(e) => set("preconditions", e.target.value)} />
          </div>
          <div>
            <label htmlFor="ts-data" className="label">
              {t("ts.testData")}
            </label>
            <textarea id="ts-data" className="input min-h-20" readOnly={!editable} value={draft.testData} onChange={(e) => set("testData", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="ts-inputs" className="label">
              {t("ts.inputs")}
            </label>
            <TagInput id="ts-inputs" label={t("ts.inputs")} disabled={!editable} value={draft.inputs} onChange={(v) => set("inputs", v)} />
            <p className="mt-1 text-xs text-ink-muted">{t("ts.inputsHint")}</p>
          </div>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-semibold">{t("ts.steps")}</h2>
          <StepsEditor value={draft.steps} onChange={(v) => set("steps", v)} readOnly={!editable} />
        </div>
        {editable && (
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <button type="submit" className="btn btn-primary" disabled={pending || (!!script && !dirty)}>
              {pending ? t("common.saving") : t("common.save")}
            </button>
            {script?.status === "APPROVED" && dirty && <span className="text-sm text-warn">{t("ts.newVersionHint", { version: script.version + 1 })}</span>}
          </div>
        )}
      </form>

      {script && (
        <section aria-labelledby="ts-runs" className="card-panel">
          <h2 id="ts-runs" className="border-b border-line px-3 py-2 font-semibold">
            {t("ts.runs")} <span className="font-normal text-ink-muted">({script.runs.length})</span>
          </h2>
          {script.runs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-ink-muted">{t("ts.noRuns")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th scope="col" className="px-3 py-1.5">ID</th>
                  <th scope="col" className="px-3 py-1.5">{t("field.phase")}</th>
                  <th scope="col" className="px-3 py-1.5">{t("ts.tester")}</th>
                  <th scope="col" className="px-3 py-1.5">{t("field.state")}</th>
                  <th scope="col" className="px-3 py-1.5">{t("ts.versionCol")}</th>
                  <th scope="col" className="px-3 py-1.5">{t("ts.attempts")}</th>
                  <th scope="col" className="px-3 py-1.5">{t("ts.lastActivity")}</th>
                </tr>
              </thead>
              <tbody>
                {script.runs.map((r) => {
                  const st = testType?.states.find((s) => s.name === r.state);
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="px-3 py-1.5">
                        <Link href={`/p/${meta.id}/items/${r.id}/run`} className="text-brand hover:underline">
                          #{r.id}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5">{r.phaseId ? phaseById.get(r.phaseId)?.name : ""}</td>
                      <td className="px-3 py-1.5">{r.assignedToId ? (userById.get(r.assignedToId)?.name ?? "") : t("common.unassigned")}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {st && <StateDot color={st.color} />} {r.state}
                      </td>
                      <td className="px-3 py-1.5">
                        v{r.scriptVersion ?? "?"}
                        {r.scriptVersion !== null && r.scriptVersion < script.version && <span className="ml-1 text-xs text-warn">({t("ts.olderVersion")})</span>}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">{r.attempts}</td>
                      <td className="px-3 py-1.5 text-ink-muted">{r.lastActivity ? formatDateTime(r.lastActivity, locale) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
