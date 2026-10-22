"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { MessageKey } from "@/lib/i18n";
import type { AttemptView, RunView, StepResultView } from "@/lib/testrun-types";
import { attemptOutcome, missingInputs, nextStepIndex, raisedTitle, type StepOutcome } from "@/lib/testscripts";
import { formatDateTime } from "@/lib/format";
import { finishAttempt, getRun, raiseFromStep, recordStep, reportScriptIssue, startAttempt } from "@/server/actions/testscripts";
import type { ActionResult } from "@/server/result";
import { useProject } from "../ProjectProvider";
import { useI18n, useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";
import { useShortcuts } from "../useShortcuts";
import { uploadFile } from "../item/upload";

const OUTCOME_UI: Record<StepOutcome, { icon: string; key: string; on: string }> = {
  Passed: { icon: "✓", key: "p", on: "bg-green-700 text-white border-green-700" },
  Failed: { icon: "✗", key: "f", on: "bg-red-700 text-white border-red-700" },
  Blocked: { icon: "⏸", key: "b", on: "bg-amber-600 text-white border-amber-600" },
  Skipped: { icon: "↷", key: "s", on: "bg-gray-600 text-white border-gray-600" },
};
const OUTCOMES = Object.keys(OUTCOME_UI) as StepOutcome[];

type Raise = { stepIndex: number; kind: "DEFECT" | "CHANGE_REQUEST" | "SCRIPT" };

export function TestRunner({ initial }: { initial: RunView }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { meta, phaseById, userById, moduleById } = useProject();
  const [view, setView] = useState(initial);
  const [pending, startTransition] = useTransition();
  const open = view.attempts.findLast((a) => !a.finishedAt) ?? null;
  const latest = view.attempts[view.attempts.length - 1] ?? null;
  // null = the newest attempt
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = view.attempts.find((a) => a.id === shownId) ?? latest;
  const executing = view.canExecute && !!open && shown?.id === open.id;
  const results = useMemo(() => new Map((shown?.results ?? []).map((r) => [r.stepIndex, r])), [shown]);
  const [current, setCurrent] = useState(() => nextStepIndex(shown?.results ?? [], view.steps.length));
  const [inputs, setInputs] = useState<Record<string, string>>(() => ({ ...(open?.inputs ?? latest?.inputs ?? {}) }));
  const [actuals, setActuals] = useState<Record<number, string>>({});
  const [raise, setRaise] = useState<Raise | null>(null);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  const outcome = shown ? attemptOutcome(shown.results, view.steps.length) : null;
  const doneCount = shown ? shown.results.filter((r) => r.stepIndex < view.steps.length).length : 0;
  const missing = missingInputs(view.inputs, inputs);
  const raisedById = new Map(view.raised.map((r) => [r.id, r]));

  const apply = (fn: () => Promise<ActionResult<RunView>>, after?: (v: RunView) => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error, "error");
      setView(res.data);
      // Follow the newest attempt when one starts or finishes.
      if (res.data.attempts.length !== view.attempts.length) setShownId(null);
      after?.(res.data);
    });

  useEffect(() => {
    stepRefs.current[current]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  const start = () => {
    if (missing.length) return toast(t("run.fillInputs", { fields: missing.join(", ") }), "error");
    apply(
      () => startAttempt(view.item.id, inputs),
      (v) => {
        const a = v.attempts[v.attempts.length - 1];
        setCurrent(nextStepIndex(a?.results ?? [], v.steps.length));
      },
    );
  };

  const saveInputs = () => {
    if (!executing || missing.length) return;
    const same = view.inputs.every((l) => (open?.inputs[l] ?? "") === (inputs[l] ?? "").trim());
    if (!same) apply(() => startAttempt(view.item.id, inputs));
  };

  const setOutcome = (i: number, o: StepOutcome) => {
    if (!executing) return;
    const actual = actuals[i];
    apply(
      () => recordStep(view.item.id, { stepIndex: i, outcome: o, ...(actual !== undefined ? { actual } : {}) }),
      (v) => {
        if (o === "Passed" || o === "Skipped") {
          const a = v.attempts.find((x) => x.id === open?.id);
          const next = a ? nextStepIndex(a.results, v.steps.length) : i;
          setCurrent(next > i ? next : Math.min(i + 1, v.steps.length - 1));
        }
      },
    );
  };

  const saveActual = (i: number) => {
    const value = actuals[i];
    const r = results.get(i);
    if (!executing || value === undefined || !r || r.actual === value) return;
    apply(() => recordStep(view.item.id, { stepIndex: i, actual: value }));
  };

  const onPaste = (i: number, e: React.ClipboardEvent) => {
    if (!executing) return;
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    if (!results.get(i)) return toast(t("run.resultFirst"), "error");
    startTransition(async () => {
      try {
        const up = await uploadFile(file, view.item.id);
        const res = await recordStep(view.item.id, { stepIndex: i, attachmentId: up.id });
        if (!res.ok) return toast(res.error, "error");
        setView(res.data);
        toast(t("run.screenshotAdded"), "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : t("common.error"), "error");
      }
    });
  };

  const finish = () => apply(() => finishAttempt(view.item.id));

  useShortcuts(
    {
      p: () => setOutcome(current, "Passed"),
      f: () => setOutcome(current, "Failed"),
      b: () => setOutcome(current, "Blocked"),
      s: () => setOutcome(current, "Skipped"),
      j: () => setCurrent((c) => Math.min(c + 1, view.steps.length - 1)),
      k: () => setCurrent((c) => Math.max(c - 1, 0)),
      ArrowDown: () => setCurrent((c) => Math.min(c + 1, view.steps.length - 1)),
      ArrowUp: () => setCurrent((c) => Math.max(c - 1, 0)),
    },
    executing,
  );

  const phase = view.item.phaseId ? phaseById.get(view.item.phaseId)?.name : null;
  const assignee = view.item.assignedToId ? userById.get(view.item.assignedToId)?.name : null;
  const testType = meta.types.find((x) => x.key === "TEST_TASK");
  const stateColor = testType?.states.find((s) => s.name === view.item.state)?.color;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/p/${meta.id}/items/${view.item.id}`} className="text-brand hover:underline">
          ← #{view.item.id}
        </Link>
        {view.script && (
          <Link href={`/p/${meta.id}/scripts/${view.script.id}`} className="text-brand hover:underline">
            {view.script.key} v{view.script.version}
          </Link>
        )}
        {view.script && view.script.version !== null && view.script.version < view.script.currentVersion && (
          <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn">{t("run.newerScript", { version: view.script.currentVersion })}</span>
        )}
      </div>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{view.item.title}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: stateColor ?? "#94a3b8" }} />
            {view.item.state}
          </span>
          {phase && <span>{phase}</span>}
          {view.item.moduleId && <span>{moduleById.get(view.item.moduleId)?.path}</span>}
          <span>
            {t("ts.tester")}: {assignee ?? t("common.unassigned")}
          </span>
        </p>
      </header>

      {view.readyForRetest && !open && (
        <div role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm font-medium text-brand-dark">
          {t("run.readyForRetest")}
        </div>
      )}

      {view.attempts.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="run-attempt" className="font-semibold">
            {t("run.attempt")}
          </label>
          <select id="run-attempt" className="input w-auto" value={shown?.id ?? ""} onChange={(e) => setShownId(e.target.value === latest?.id ? null : e.target.value)}>
            {view.attempts.map((a) => (
              <option key={a.id} value={a.id}>
                {attemptLabel(a, t, locale)}
              </option>
            ))}
          </select>
        </div>
      )}

      <section aria-labelledby="run-setup" className="card-panel space-y-3 p-4">
        <h2 id="run-setup" className="sr-only">
          {t("run.setup")}
        </h2>
        {view.preconditions && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("ts.preconditions")}</h3>
            <p className="whitespace-pre-wrap text-sm">{view.preconditions}</p>
          </div>
        )}
        {view.testData && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("ts.testData")}</h3>
            <p className="whitespace-pre-wrap text-sm">{view.testData}</p>
          </div>
        )}
        {view.inputs.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {view.inputs.map((label, i) => {
              const editable = view.canExecute && (!open || executing);
              const value = editable ? (inputs[label] ?? "") : (shown?.inputs[label] ?? "");
              return (
                <div key={label}>
                  <label htmlFor={`run-input-${i}`} className="label">
                    {label} <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <input
                    id={`run-input-${i}`}
                    className="input"
                    required
                    aria-required="true"
                    readOnly={!editable}
                    value={value}
                    onChange={(e) => setInputs((v) => ({ ...v, [label]: e.target.value }))}
                    onBlur={saveInputs}
                  />
                </div>
              );
            })}
            {view.canExecute && <p className="text-xs text-ink-muted sm:col-span-2">{t("run.inputsHint")}</p>}
          </div>
        )}
        {view.canExecute && !open && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" disabled={pending || view.steps.length === 0} onClick={start}>
              ▶ {view.attempts.length === 0 ? t("run.start") : t("run.retest", { number: view.attempts.length + 1 })}
            </button>
            {missing.length > 0 && <span className="text-sm text-ink-muted">{t("run.fillInputs", { fields: missing.join(", ") })}</span>}
          </div>
        )}
        {!view.canExecute && view.attempts.length === 0 && <p className="text-sm text-ink-muted">{t("run.notRunYet")}</p>}
      </section>

      {view.steps.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("run.noSteps")}</p>
      ) : (
        <section aria-labelledby="run-steps" className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="run-steps" className="mr-auto font-semibold">
              {t("ts.steps")}{" "}
              <span className="font-normal text-ink-muted">
                {t("run.progress", { done: doneCount, total: view.steps.length })}
              </span>
            </h2>
            {executing && <span className="text-xs text-ink-muted">{t("run.keys")}</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-gray-200" aria-hidden="true">
            <div className="h-full bg-brand transition-all" style={{ width: `${(doneCount / view.steps.length) * 100}%` }} />
          </div>
          <ol className="space-y-2">
            {view.steps.map((step, i) => {
              const r = results.get(i);
              const isCurrent = executing && i === current;
              return (
                <li
                  key={i}
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => executing && setCurrent(i)}
                  onPaste={(e) => onPaste(i, e)}
                  className={`card-panel p-3 ${isCurrent ? "ring-2 ring-brand" : ""}`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="mt-0.5 w-6 shrink-0 text-right font-semibold text-ink-muted">{i + 1}</span>
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold text-ink-muted">{t("item.stepAction")}</div>
                        <p className="whitespace-pre-wrap">{step.action}</p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ink-muted">{t("item.stepExpected")}</div>
                        <p className="whitespace-pre-wrap">{step.expected}</p>
                      </div>
                    </div>
                  </div>
                  <StepResult
                    index={i}
                    result={r}
                    executing={executing}
                    pending={pending}
                    actual={actuals[i] ?? r?.actual ?? ""}
                    onActual={(v) => setActuals((a) => ({ ...a, [i]: v }))}
                    onActualBlur={() => saveActual(i)}
                    onOutcome={(o) => setOutcome(i, o)}
                    onRemoveAttachment={(id) => apply(() => recordStep(view.item.id, { stepIndex: i, removeAttachmentId: id }))}
                    attachments={view.attachments}
                  />
                  {r && (r.raised.length > 0 || (executing && r.outcome !== "Passed" && r.outcome !== "Skipped") || (executing && view.canRaise)) && (
                    <div className="ml-9 mt-2 flex flex-wrap items-center gap-2">
                      {r.raised.map((id) => {
                        const it = raisedById.get(id);
                        return (
                          <Link key={id} href={`/p/${meta.id}/items/${id}`} className="rounded border border-line bg-gray-50 px-2 py-0.5 text-xs hover:underline">
                            {it ? `${it.typeName} #${id} · ${it.state}` : `#${id}`}
                          </Link>
                        );
                      })}
                      {executing && view.canRaise && (r.outcome === "Failed" || r.outcome === "Blocked") && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setRaise({ stepIndex: i, kind: "DEFECT" })}>
                          + {t("run.createDefect")}
                        </button>
                      )}
                      {executing && view.canRaise && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRaise({ stepIndex: i, kind: "CHANGE_REQUEST" })}>
                          {t("run.isChange")}
                        </button>
                      )}
                      {executing && view.script && r.outcome !== "Passed" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRaise({ stepIndex: i, kind: "SCRIPT" })}>
                          {t("run.scriptWrong")}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {executing && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 py-3">
          <span className="text-sm">{outcome ? t("run.outcomeSoFar", { outcome: t(`run.outcome.${outcome}` as MessageKey) }) : t("run.recordAll")}</span>
          <button type="button" className="btn btn-primary ml-auto" disabled={pending || !outcome} onClick={finish}>
            {t("run.finish")}
          </button>
        </div>
      )}

      {!open && shown?.finishedAt && (
        <div role="status" className={`rounded border p-3 text-sm ${shown.outcome === "Passed" ? "border-ok bg-green-50" : shown.outcome === "Failed" ? "border-danger bg-red-50" : "border-warn bg-warn-soft"}`}>
          <p className="font-semibold">{attemptLabel(shown, t, locale)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={`/p/${meta.id}/items/${view.item.id}`} className="btn btn-secondary btn-sm">
              {t("run.backToItem")}
            </Link>
            {view.nextRunId && (
              <Link href={`/p/${meta.id}/items/${view.nextRunId}/run`} className="btn btn-primary btn-sm">
                {t("run.nextTest")} →
              </Link>
            )}
          </div>
        </div>
      )}

      {raise && open && (
        <RaiseDialog
          raise={raise}
          view={view}
          attempt={open}
          actual={actuals[raise.stepIndex] ?? results.get(raise.stepIndex)?.actual ?? ""}
          onClose={() => setRaise(null)}
          onDone={(v) => v && setView(v)}
        />
      )}
    </main>
  );
}

function attemptLabel(a: AttemptView, t: ReturnType<typeof useI18n>["t"], locale: ReturnType<typeof useI18n>["locale"]): string {
  const result = a.outcome ? t(`run.outcome.${a.outcome}` as MessageKey) : t("run.inProgress");
  return `${t("run.attempt")} ${a.number} · ${result} · ${a.testerName} · ${formatDateTime(a.finishedAt ?? a.startedAt, locale)}`;
}

function StepResult(props: {
  index: number;
  result: StepResultView | undefined;
  executing: boolean;
  pending: boolean;
  actual: string;
  onActual: (v: string) => void;
  onActualBlur: () => void;
  onOutcome: (o: StepOutcome) => void;
  onRemoveAttachment: (id: string) => void;
  attachments: RunView["attachments"];
}) {
  const t = useT();
  const { result: r, index: i } = props;
  const shots = (r?.attachments ?? []).map((id) => props.attachments.find((a) => a.id === id)).filter((a): a is RunView["attachments"][number] => !!a);
  if (!props.executing && !r) return null;
  return (
    <div className="ml-9 mt-2 space-y-2">
      {props.executing ? (
        <div role="group" aria-label={`${t("run.result")} ${i + 1}`} className="flex flex-wrap gap-1">
          {OUTCOMES.map((o) => {
            const ui = OUTCOME_UI[o];
            const on = r?.outcome === o;
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                disabled={props.pending}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onOutcome(o);
                }}
                className={`btn btn-sm border ${on ? ui.on : "border-line bg-white"}`}
                title={`${t(`run.outcome.${o}` as MessageKey)} (${ui.key.toUpperCase()})`}
              >
                <span aria-hidden="true">{ui.icon}</span> {t(`run.outcome.${o}` as MessageKey)}
              </button>
            );
          })}
          {r?.carried && <span className="self-center text-xs text-ink-muted">{t("run.carried")}</span>}
        </div>
      ) : (
        r && (
          <p className="text-sm">
            <span className="font-semibold">{t(`run.outcome.${r.outcome}` as MessageKey)}</span>
            {r.carried && <span className="ml-2 text-xs text-ink-muted">{t("run.carried")}</span>}
          </p>
        )
      )}
      {props.executing ? (
        <div>
          <label htmlFor={`run-actual-${i}`} className="sr-only">
            {t("run.actual")} {i + 1}
          </label>
          <textarea
            id={`run-actual-${i}`}
            className="input min-h-12 text-sm"
            placeholder={r?.outcome === "Failed" || r?.outcome === "Blocked" ? t("run.actualRequired") : t("run.actualPlaceholder")}
            value={props.actual}
            onChange={(e) => props.onActual(e.target.value)}
            onBlur={props.onActualBlur}
          />
        </div>
      ) : (
        r?.actual && <p className="whitespace-pre-wrap text-sm text-ink-muted">{r.actual}</p>
      )}
      {shots.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("run.screenshots")}>
          {shots.map((a) => (
            <li key={a.id} className="relative">
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                {a.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/attachments/${a.id}`} alt={a.fileName} className="h-16 w-24 rounded border border-line object-cover" />
                ) : (
                  <span className="text-xs text-brand underline">{a.fileName}</span>
                )}
              </a>
              {props.executing && (
                <button type="button" className="absolute -right-2 -top-2 rounded-full bg-white px-1 text-xs shadow" aria-label={`${t("common.remove")} ${a.fileName}`} onClick={() => props.onRemoveAttachment(a.id)}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {props.executing && r && <p className="text-xs text-ink-muted">{t("run.pasteHint")}</p>}
    </div>
  );
}

function RaiseDialog({ raise, view, attempt, actual, onClose, onDone }: { raise: Raise; view: RunView; attempt: AttemptView; actual: string; onClose: () => void; onDone: (v: RunView | null) => void }) {
  const t = useT();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const kind = raise.kind;
  const ctx = {
    runId: view.item.id,
    runTitle: view.item.title,
    scriptKey: view.script?.key ?? null,
    preconditions: view.preconditions,
    testData: view.testData,
    inputs: attempt.inputs,
    steps: view.steps,
    stepIndex: raise.stepIndex,
    actual,
  };
  const [title, setTitle] = useState(kind === "SCRIPT" ? "" : raisedTitle(ctx, kind));
  const [severity, setSeverity] = useState(2);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (kind === "SCRIPT") {
      const res = await reportScriptIssue(view.item.id, raise.stepIndex, note);
      setBusy(false);
      if (!res.ok) return toast(res.error, "error");
      toast(t("run.scriptReported"), "success");
      ref.current?.close();
      return;
    }
    // Save the actual result typed so far, so the defect gets it too.
    if (actual !== (attempt.results.find((r) => r.stepIndex === raise.stepIndex)?.actual ?? "")) await recordStep(view.item.id, { stepIndex: raise.stepIndex, actual });
    const res = await raiseFromStep(view.item.id, { stepIndex: raise.stepIndex, kind, title, ...(kind === "DEFECT" ? { severity } : {}) });
    if (!res.ok) {
      setBusy(false);
      return toast(res.error, "error");
    }
    const fresh = await getRun(view.item.id);
    setBusy(false);
    toast(t(kind === "DEFECT" ? "run.defectCreated" : "run.changeCreated", { id: res.data.id }), "success");
    onDone(fresh.ok ? fresh.data : null);
    ref.current?.close();
  };

  const heading = kind === "DEFECT" ? t("run.createDefect") : kind === "CHANGE_REQUEST" ? t("run.isChange") : t("run.scriptWrong");
  return (
    <dialog ref={ref} aria-labelledby="raise-title" onClose={onClose} className="m-auto w-[min(560px,95vw)] rounded-lg p-0 shadow-2xl backdrop:bg-black/40">
      <form onSubmit={submit}>
        <div className="border-b border-line px-4 py-3">
          <h2 id="raise-title" className="text-lg font-semibold">
            {heading} – {t("run.step", { number: raise.stepIndex + 1 })}
          </h2>
          <p className="text-sm text-ink-muted">{kind === "SCRIPT" ? t("run.scriptWrongIntro") : kind === "DEFECT" ? t("run.defectIntro") : t("run.changeIntro")}</p>
        </div>
        <div className="space-y-3 px-4 py-3">
          {kind === "SCRIPT" ? (
            <div>
              <label htmlFor="raise-note" className="label">
                {t("run.whatIsWrong")}
              </label>
              <textarea id="raise-note" className="input min-h-24" required value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="raise-name" className="label">
                  {t("field.title")}
                </label>
                <input id="raise-name" className="input" required maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              {kind === "DEFECT" && (
                <div>
                  <label htmlFor="raise-sev" className="label">
                    {t("field.severity")}
                  </label>
                  <select id="raise-sev" className="input w-auto" value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((s) => (
                      <option key={s} value={s}>
                        {t(`severity.${s}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!actual.trim() && kind === "DEFECT" && <p className="text-sm text-warn">{t("run.noActual")}</p>}
              <p className="text-xs text-ink-muted">{t("run.prefillNote")}</p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>
            {t("common.cancel")}
          </button>
          <button type="submit" className={`btn ${kind === "DEFECT" ? "btn-danger" : "btn-primary"}`} disabled={busy}>
            {kind === "SCRIPT" ? t("run.sendNote") : t("common.create")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
