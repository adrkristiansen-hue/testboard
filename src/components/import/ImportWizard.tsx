"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { guessMapping, importTargets, validateImport, type ImportTarget } from "@/lib/import";
import { readImportFile, importItems } from "@/server/actions/import";
import type { ParsedFile } from "@/server/import-parse";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useToast } from "../ui/Toast";

const PREVIEW_ROWS = 100;

export function ImportWizard({ existingIds, defaultPhaseId }: { existingIds: number[]; defaultPhaseId: string | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const { meta, typeById, userById, moduleById, phaseById } = useProject();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ImportTarget[]>([]);
  const [typeId, setTypeId] = useState(meta.types.find((x) => x.key === "TEST_TASK")?.id ?? meta.types[0]?.id ?? "");
  const [phaseId, setPhaseId] = useState<string | null>(defaultPhaseId);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null);

  const targets = useMemo(() => importTargets(meta), [meta]);
  const ids = useMemo(() => new Set(existingIds), [existingIds]);
  const results = useMemo(
    () => (parsed ? validateImport(parsed.rows, mapping, meta, { typeId, phaseId, moduleId }, ids) : []),
    [parsed, mapping, meta, typeId, phaseId, moduleId, ids],
  );
  const valid = results.filter((r) => r.item).length;
  const invalid = results.length - valid;
  const hasTitle = mapping.includes("title");

  const load = async (f: File, sheet?: string) => {
    setBusy(true);
    setDone(null);
    const fd = new FormData();
    fd.set("file", f);
    fd.set("projectId", meta.id);
    if (sheet) fd.set("sheet", sheet);
    const res = await readImportFile(fd);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setParsed(res.data);
    setMapping(guessMapping(res.data.headers, meta));
  };

  const run = async () => {
    if (!parsed || !file) return;
    setBusy(true);
    const res = await importItems({ projectId: meta.id, fileName: file.name, mapping, rows: parsed.rows, defaults: { typeId, phaseId, moduleId }, skipInvalid });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setDone({ created: res.data.created, skipped: res.data.skipped });
    toast(t("import.done", { created: res.data.created, skipped: res.data.skipped }), "success");
  };

  const setTarget = (i: number, v: ImportTarget) =>
    // A target can only be used by one column: clear it elsewhere.
    setMapping((m) => m.map((x, j) => (j === i ? v : v !== "ignore" && x === v ? "ignore" : x)));

  const shown = (onlyErrors ? results.filter((r) => !r.item) : results).slice(0, PREVIEW_ROWS);
  const sample = (col: number) =>
    parsed!.rows
      .map((r) => r[col])
      .filter((v) => v !== null && v !== "")
      .slice(0, 3)
      .map((v) => String(v).slice(0, 40))
      .join(" · ");

  return (
    <main className="w-full max-w-6xl space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">{t("import.title")}</h1>
        <a href={`/api/projects/${meta.id}/import-template`} className="btn btn-secondary btn-sm" download>
          {t("import.downloadTemplate")}
        </a>
      </div>

      <section aria-labelledby="imp-1" className="card-panel space-y-2 p-3">
        <h2 id="imp-1" className="font-semibold">
          1. {t("import.chooseFile")}
        </h2>
        <p className="text-sm text-ink-muted">{t("import.fileHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            aria-label={t("import.chooseFile")}
            accept=".xlsx,.csv,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setParsed(null);
              if (f) void load(f);
            }}
          />
          {parsed && parsed.sheets.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              {t("import.sheet")}
              <select className="rounded border border-line-strong bg-white px-2 py-1" value={parsed.sheet} onChange={(e) => file && load(file, e.target.value)}>
                {parsed.sheets.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          {busy && <span className="text-sm text-ink-muted">{t("common.loading")}</span>}
        </div>
        {parsed?.truncated && <p className="text-sm font-semibold text-danger">{t("import.truncated", { max: parsed.rows.length })}</p>}
      </section>

      {parsed && (
        <section aria-labelledby="imp-2" className="card-panel space-y-3 p-3">
          <h2 id="imp-2" className="font-semibold">
            2. {t("import.mapColumns")}
          </h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              {t("import.defaultType")}
              <select className="rounded border border-line-strong bg-white px-2 py-1" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {meta.types.filter((x) => !x.disabled).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              {t("import.defaultPhase")}
              <select className="rounded border border-line-strong bg-white px-2 py-1" value={phaseId ?? ""} onChange={(e) => setPhaseId(e.target.value || null)}>
                <option value="">{t("common.none")}</option>
                {meta.phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              {t("import.defaultModule")}
              <select className="rounded border border-line-strong bg-white px-2 py-1" value={moduleId ?? ""} onChange={(e) => setModuleId(e.target.value || null)}>
                <option value="">{t("common.none")}</option>
                {meta.modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.path}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-ink-muted">{t("import.defaultsHint")}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th scope="col" className="py-1 pr-2 font-semibold">{t("import.sourceColumn")}</th>
                <th scope="col" className="py-1 pr-2 font-semibold">{t("import.examples")}</th>
                <th scope="col" className="py-1 font-semibold">{t("import.targetField")}</th>
              </tr>
            </thead>
            <tbody>
              {parsed.headers.map((h, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-2 font-medium">{h}</td>
                  <td className="max-w-md truncate py-1 pr-2 text-ink-muted">{sample(i)}</td>
                  <td className="py-1">
                    <select aria-label={t("import.mapLabel", { column: h })} className={`rounded border px-2 py-1 ${mapping[i] === "ignore" ? "border-line-strong bg-white text-ink-muted" : "border-brand bg-brand-soft"}`} value={mapping[i]} onChange={(e) => setTarget(i, e.target.value as ImportTarget)}>
                      <option value="ignore">{t("import.ignore")}</option>
                      {targets.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!hasTitle && <p className="text-sm font-semibold text-danger">{t("import.needTitle")}</p>}
        </section>
      )}

      {parsed && hasTitle && (
        <section aria-labelledby="imp-3" className="card-panel space-y-3 p-3">
          <h2 id="imp-3" className="font-semibold">
            3. {t("import.preview")}
          </h2>
          <p className="text-sm" aria-live="polite">
            <span className="font-semibold text-[#006300]">✓ {t("import.validRows", { count: valid })}</span>
            {invalid > 0 && <span className="ml-3 font-semibold text-danger">✕ {t("import.invalidRows", { count: invalid })}</span>}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
            {t("import.onlyErrors")}
          </label>
          <div className="max-h-[50vh] overflow-auto rounded border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-xs text-ink-muted">
                  <th scope="col" className="px-2 py-1 font-semibold">{t("import.line")}</th>
                  <th scope="col" className="px-2 py-1 font-semibold">{t("field.title")}</th>
                  <th scope="col" className="px-2 py-1 font-semibold">{t("field.type")}</th>
                  <th scope="col" className="px-2 py-1 font-semibold">{t("field.state")}</th>
                  <th scope="col" className="px-2 py-1 font-semibold">{t("field.assignedTo")}</th>
                  <th scope="col" className="px-2 py-1 font-semibold">{t("field.module")}</th>
                  <th scope="col" className="px-2 py-1 font-semibold">{t("field.phase")}</th>
                  <th scope="col" className="px-2 py-1 font-semibold">{t("import.result")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const it = r.item;
                  const raw = parsed.rows[r.line - 2];
                  return (
                    <tr key={r.line} className={`border-t border-line align-top ${it ? "" : "bg-red-50"}`}>
                      <td className="px-2 py-1 text-ink-muted">{r.line}</td>
                      <td className="px-2 py-1">{it?.title ?? String(raw[mapping.indexOf("title")] ?? "")}</td>
                      <td className="px-2 py-1">{it ? typeById.get(it.typeId)?.name : ""}</td>
                      <td className="px-2 py-1">{it?.state ?? (it ? "–" : "")}</td>
                      <td className="px-2 py-1">{it?.assignedToId ? userById.get(it.assignedToId)?.name : ""}</td>
                      <td className="px-2 py-1">{it?.moduleId ? moduleById.get(it.moduleId)?.path : ""}</td>
                      <td className="px-2 py-1">{it?.phaseId ? phaseById.get(it.phaseId)?.name : ""}</td>
                      <td className="px-2 py-1">
                        {it ? (
                          <span className="text-[#006300]">✓ OK</span>
                        ) : (
                          <ul className="text-danger">
                            {r.errors.map((e, i) => (
                              <li key={i}>✕ {e}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {results.length > PREVIEW_ROWS && <p className="text-xs text-ink-muted">{t("import.previewLimit", { count: PREVIEW_ROWS })}</p>}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            {invalid > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} />
                {t("import.skipInvalid", { count: invalid })}
              </label>
            )}
            <button type="button" className="btn btn-primary" disabled={busy || valid === 0 || (invalid > 0 && !skipInvalid) || !!done} onClick={run}>
              {busy ? t("common.saving") : t("import.run", { count: valid })}
            </button>
            {done && (
              <p role="status" className="text-sm">
                {t("import.done", { created: done.created, skipped: done.skipped })}{" "}
                <Link href={`/p/${meta.id}/items`} className="font-semibold text-brand hover:underline">
                  {t("import.openList")}
                </Link>
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
