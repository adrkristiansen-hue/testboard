"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MessageKey } from "@/lib/i18n";
import type { ScriptSummary } from "@/lib/testrun-types";
import { SCRIPT_STATUSES, type ScriptStatus } from "@/lib/testscripts";
import { formatDate } from "@/lib/format";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { PlanDialog } from "./PlanDialog";
import { StatusBadge } from "./StatusBadge";

export function ScriptLibrary({ scripts }: { scripts: ScriptSummary[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { meta, moduleById, can } = useProject();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ScriptStatus | "">("");
  const [moduleId, setModuleId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState(false);

  const visible = useMemo(() => {
    const q = text.trim().toLowerCase();
    return scripts.filter(
      (s) =>
        (!status ? s.status !== "RETIRED" : s.status === status) &&
        (!moduleId || s.moduleId === moduleId) &&
        (!q || s.title.toLowerCase().includes(q) || s.key.toLowerCase() === q || s.key.toLowerCase().includes(q)),
    );
  }, [scripts, text, status, moduleId]);

  const canPlan = can("items.create");
  const allSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));
  const toggle = (id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)));
  const chosen = scripts.filter((s) => selected.has(s.id));

  return (
    <main className="w-full max-w-6xl space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">{t("nav.scripts")}</h1>
        {canPlan && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={chosen.length === 0} onClick={() => setPlanning(true)}>
            ▶ {t("ts.plan")} {chosen.length > 0 && `(${chosen.length})`}
          </button>
        )}
        {can("scripts.edit") && (
          <Link href={`/p/${meta.id}/scripts/new`} className="btn btn-primary btn-sm">
            + {t("ts.new")}
          </Link>
        )}
      </div>
      <p className="text-sm text-ink-muted">{t("ts.intro")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-64" placeholder={t("ts.filter")} aria-label={t("ts.filter")} value={text} onChange={(e) => setText(e.target.value)} />
        <select className="input w-auto" aria-label={t("ts.status")} value={status} onChange={(e) => setStatus(e.target.value as ScriptStatus | "")}>
          <option value="">{t("ts.activeStatuses")}</option>
          {SCRIPT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`ts.status.${s}` as MessageKey)}
            </option>
          ))}
        </select>
        <select className="input w-auto" aria-label={t("field.module")} value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          <option value="">{t("ts.allModules")}</option>
          {meta.modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.path}
            </option>
          ))}
        </select>
        <span className="text-sm text-ink-muted">{t("ts.count", { count: visible.length })}</span>
      </div>

      <div className="card-panel overflow-x-auto">
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">{scripts.length === 0 ? t("ts.empty") : t("ts.noMatch")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                {canPlan && (
                  <th scope="col" className="w-8 px-3 py-2">
                    <input type="checkbox" aria-label={t("ts.selectAll")} checked={allSelected} onChange={toggleAll} />
                  </th>
                )}
                <th scope="col" className="px-2 py-2">ID</th>
                <th scope="col" className="px-2 py-2">{t("field.title")}</th>
                <th scope="col" className="px-2 py-2">{t("field.module")}</th>
                <th scope="col" className="px-2 py-2 text-right">{t("ts.steps")}</th>
                <th scope="col" className="px-2 py-2">{t("ts.status")}</th>
                <th scope="col" className="px-2 py-2">{t("ts.runs")}</th>
                <th scope="col" className="px-2 py-2">{t("field.changedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-gray-50">
                  {canPlan && (
                    <td className="px-3 py-1.5">
                      <input type="checkbox" aria-label={`${t("ts.select")} ${s.key}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-muted">{s.key}</td>
                  <td className="px-2 py-1.5">
                    <Link href={`/p/${meta.id}/scripts/${s.id}`} className="font-medium text-brand hover:underline">
                      {s.title}
                    </Link>
                    {s.reviewNote && (
                      <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn" title={s.reviewNote}>
                        ⚠ {t("ts.needsReview")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-ink-muted">{s.moduleId ? moduleById.get(s.moduleId)?.path : ""}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.stepCount}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <StatusBadge status={s.status} /> <span className="text-xs text-ink-muted">v{s.version}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                    {s.runs.total === 0 ? (
                      <span className="text-ink-muted">–</span>
                    ) : (
                      <span title={t("ts.runsTitle", { passed: s.runs.passed, failed: s.runs.failed, blocked: s.runs.blocked, open: s.runs.open })} className="inline-flex gap-1.5">
                        {s.runs.passed > 0 && <span className="text-ok">{s.runs.passed} ✓</span>}
                        {s.runs.failed > 0 && <span className="text-danger">{s.runs.failed} ✗</span>}
                        {s.runs.blocked > 0 && <span className="text-warn">{s.runs.blocked} ⏸</span>}
                        {s.runs.open > 0 && <span className="text-brand">{s.runs.open} ▶</span>}
                        <span className="text-ink-muted">{t("ts.ofRuns", { count: s.runs.total })}</span>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-muted">{formatDate(s.updatedAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {planning && (
        <PlanDialog
          scripts={chosen}
          onClose={() => setPlanning(false)}
          onPlanned={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </main>
  );
}
