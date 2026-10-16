"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ColumnDef } from "@/lib/board";
import { validateColumns } from "@/lib/board";
import type { SwimlaneConfig, SwimlaneMode, LaneRule } from "@/lib/swimlanes";
import { CARD_FIELDS, type CardConfig, type CardRule } from "@/lib/cards";
import type { MessageKey } from "@/lib/i18n";
import { saveCardConfig, saveColumns, saveSwimlanes } from "@/server/actions/config";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";
import { ConditionEditor } from "../query/ConditionEditor";

type Tab = "columns" | "swimlanes" | "cards";

const newId = () => Math.random().toString(36).slice(2, 10);

export function BoardSettings(props: { teamId: string; teamName: string; columns: ColumnDef[]; swimlanes: SwimlaneConfig; cardConfig: CardConfig }) {
  const t = useT();
  const { meta } = useProject();
  const [tab, setTab] = useState<Tab>("columns");
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-3 flex items-center gap-3">
        <Link href={`/p/${meta.id}/boards/${props.teamId}`} className="btn btn-ghost btn-sm">
          ← {t("common.back")}
        </Link>
        <h1 className="text-lg font-semibold">
          {t("board.settings")} – {props.teamName}
        </h1>
      </div>
      <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
        {(["columns", "swimlanes", "cards"] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`border-b-2 px-3 py-1.5 text-sm ${tab === k ? "border-brand font-semibold" : "border-transparent text-ink-muted"}`}>
            {t(`settings.${k}` as MessageKey)}
          </button>
        ))}
      </div>
      {tab === "columns" && <ColumnsEditor teamId={props.teamId} initial={props.columns} />}
      {tab === "swimlanes" && <SwimlanesEditor teamId={props.teamId} initial={props.swimlanes} />}
      {tab === "cards" && <CardsEditor teamId={props.teamId} initial={props.cardConfig} />}
    </main>
  );
}

function SaveBar({ pending, onSave, problems }: { pending: boolean; onSave: () => void; problems?: string[] }) {
  const t = useT();
  return (
    <div className="sticky bottom-0 mt-4 flex flex-col gap-2 border-t border-line bg-canvas py-3">
      {problems && problems.length > 0 && (
        <ul role="status" className="list-disc rounded bg-warn-soft py-2 pl-6 pr-2 text-sm text-warn">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={onSave}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

function ColumnsEditor({ teamId, initial }: { teamId: string; initial: ColumnDef[] }) {
  const t = useT();
  const { meta } = useProject();
  const toast = useToast();
  const router = useRouter();
  const [cols, setCols] = useState(initial);
  const [pending, start] = useTransition();
  const types = meta.types.filter((ty) => !ty.disabled);
  const problems = useMemo(() => validateColumns(cols.map((c, i) => ({ ...c, order: i })), types), [cols, types]);

  const update = (i: number, patch: Partial<ColumnDef>) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: -1 | 1) =>
    setCols((cs) => {
      const j = i + d;
      if (j < 0 || j >= cs.length) return cs;
      const n = [...cs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const toggleState = (i: number, typeId: string, state: string) => {
    const cur = cols[i].stateMap[typeId] ?? [];
    const next = cur.includes(state) ? cur.filter((s) => s !== state) : [...cur, state];
    update(i, { stateMap: { ...cols[i].stateMap, [typeId]: next } });
  };

  const save = () =>
    start(async () => {
      const res = await saveColumns(
        teamId,
        cols.map((c) => ({ id: c.id.startsWith("new-") ? undefined : c.id, name: c.name, wipLimit: c.wipLimit, split: c.split, stateMap: c.stateMap })),
      );
      if (!res.ok) return toast(res.error, "error");
      toast(t("common.saved"), "success");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        Each column shows the selected states per work item type. When a card is dropped on a column, its state changes to the first selected state that the workflow allows.
      </p>
      {cols.map((c, i) => (
        <section key={c.id} className="card-panel p-3" aria-label={c.name}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor={`cn-${c.id}`}>
                {t("common.name")}
              </label>
              <input id={`cn-${c.id}`} className="input" value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
            </div>
            <div className="w-28">
              <label className="label" htmlFor={`cw-${c.id}`}>
                {t("board.wip")}
              </label>
              <input id={`cw-${c.id}`} type="number" min={0} className="input" value={c.wipLimit ?? ""} onChange={(e) => update(i, { wipLimit: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <label className="flex items-center gap-2 pb-1.5 text-sm">
              <input type="checkbox" checked={c.split} onChange={(e) => update(i, { split: e.target.checked })} />
              {t("settings.split")}
            </label>
            <div className="ml-auto flex">
              <button type="button" className="icon-btn" aria-label={`${t("common.moveUp")} ${c.name}`} disabled={i === 0} onClick={() => move(i, -1)}>
                ←
              </button>
              <button type="button" className="icon-btn" aria-label={`${t("common.moveDown")} ${c.name}`} disabled={i === cols.length - 1} onClick={() => move(i, 1)}>
                →
              </button>
              <button type="button" className="icon-btn" aria-label={`${t("common.remove")} ${c.name}`} onClick={() => setCols((cs) => cs.filter((_, j) => j !== i))}>
                🗑
              </button>
            </div>
          </div>
          <fieldset className="mt-3">
            <legend className="label">{t("settings.stateMapping")}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {types.map((ty) => (
                <div key={ty.id} className="rounded border border-line p-2">
                  <div className="mb-1 text-xs font-semibold" style={{ color: ty.color }}>
                    {ty.name}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {ty.states.map((s) => (
                      <label key={s.name} className="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={(c.stateMap[ty.id] ?? []).includes(s.name)} onChange={() => toggleState(i, ty.id, s.name)} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        </section>
      ))}
      <div>
        <button type="button" className="btn btn-secondary" onClick={() => setCols((cs) => [...cs, { id: `new-${newId()}`, name: "New column", order: cs.length, wipLimit: null, split: false, stateMap: {} }])}>
          + {t("settings.addColumn")}
        </button>
      </div>
      <SaveBar pending={pending} onSave={save} problems={problems} />
    </div>
  );
}

function SwimlanesEditor({ teamId, initial }: { teamId: string; initial: SwimlaneConfig }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [cfg, setCfg] = useState<SwimlaneConfig>({ rules: [], ...initial });
  const [pending, start] = useTransition();
  const rules = cfg.rules ?? [];
  const setRule = (i: number, r: LaneRule) => setCfg({ ...cfg, rules: rules.map((x, j) => (j === i ? r : x)) });
  const save = () =>
    start(async () => {
      const res = await saveSwimlanes(teamId, cfg);
      if (!res.ok) return toast(res.error, "error");
      toast(t("common.saved"), "success");
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="card-panel p-3">
        <legend className="label px-1">{t("settings.swimlaneMode")}</legend>
        <div className="flex flex-wrap gap-4">
          {(["none", "module", "assignee", "priority", "rules"] as SwimlaneMode[]).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="lanemode" checked={cfg.mode === m} onChange={() => setCfg({ ...cfg, mode: m })} />
              {t(`settings.mode.${m}` as MessageKey)}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">Dragging a card to another lane updates the module, assignee or priority when lanes are grouped by that field.</p>
      </fieldset>
      {cfg.mode === "rules" && (
        <>
          <p className="text-sm text-ink-muted">Rules are checked from top to bottom; the first match decides the lane. Example: Priority = 1 → “Expedite”.</p>
          {rules.map((r, i) => (
            <section key={r.id} className="card-panel p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <label className="label" htmlFor={`rn-${r.id}`}>
                    {t("settings.ruleName")}
                  </label>
                  <input id={`rn-${r.id}`} className="input" value={r.name} onChange={(e) => setRule(i, { ...r, name: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor={`rc-${r.id}`}>
                    {t("settings.color")}
                  </label>
                  <input id={`rc-${r.id}`} type="color" className="h-8 w-12 rounded border border-line-strong" value={r.color ?? "#dc2626"} onChange={(e) => setRule(i, { ...r, color: e.target.value })} />
                </div>
                <button type="button" className="icon-btn" aria-label={`${t("common.moveUp")} ${r.name}`} disabled={i === 0} onClick={() => { const n = [...rules]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setCfg({ ...cfg, rules: n }); }}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label={`${t("common.remove")} ${r.name}`} onClick={() => setCfg({ ...cfg, rules: rules.filter((_, j) => j !== i) })}>
                  🗑
                </button>
              </div>
              <ConditionEditor value={r.when} onChange={(g) => setRule(i, { ...r, when: g })} />
            </section>
          ))}
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => setCfg({ ...cfg, rules: [...rules, { id: newId(), name: "Expedite", color: "#dc2626", when: { logic: "and", clauses: [{ field: "priority", op: "eq", value: 1 }] } }] })}>
              + {t("settings.addRule")}
            </button>
            <div>
              <label className="label" htmlFor="defaultlane">
                {t("settings.defaultLane")}
              </label>
              <input id="defaultlane" className="input" value={cfg.defaultLaneName ?? ""} onChange={(e) => setCfg({ ...cfg, defaultLaneName: e.target.value })} placeholder={t("common.default")} />
            </div>
          </div>
        </>
      )}
      <SaveBar pending={pending} onSave={save} />
    </div>
  );
}

function CardsEditor({ teamId, initial }: { teamId: string; initial: CardConfig }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [cfg, setCfg] = useState(initial);
  const [pending, start] = useTransition();
  const setRule = (i: number, r: CardRule) => setCfg({ ...cfg, rules: cfg.rules.map((x, j) => (j === i ? r : x)) });
  const fieldLabels: Record<string, MessageKey> = {
    assignee: "field.assignedTo",
    module: "field.module",
    priority: "field.priority",
    severity: "field.severity",
    tags: "field.tags",
    dueDate: "field.dueDate",
    phase: "field.phase",
    comments: "field.comments",
    children: "field.children",
    state: "field.state",
  };
  const save = () =>
    start(async () => {
      const res = await saveCardConfig(teamId, cfg);
      if (!res.ok) return toast(res.error, "error");
      toast(t("common.saved"), "success");
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="card-panel p-3">
        <legend className="label px-1">{t("settings.cardFields")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {CARD_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.fields.includes(f)} onChange={(e) => setCfg({ ...cfg, fields: e.target.checked ? [...cfg.fields, f] : cfg.fields.filter((x) => x !== f) })} />
              {t(fieldLabels[f])}
            </label>
          ))}
        </div>
      </fieldset>
      <h2 className="text-sm font-semibold">{t("settings.colorRules")}</h2>
      {cfg.rules.map((r, i) => (
        <section key={r.id} className="card-panel p-3">
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-1 pb-1.5 text-sm">
              <input type="checkbox" checked={r.enabled} onChange={(e) => setRule(i, { ...r, enabled: e.target.checked })} />
              <span className="sr-only">Enabled</span>
            </label>
            <div className="flex-1">
              <label className="label" htmlFor={`cr-${r.id}`}>
                {t("settings.ruleName")}
              </label>
              <input id={`cr-${r.id}`} className="input" value={r.name} onChange={(e) => setRule(i, { ...r, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor={`cs-${r.id}`}>
                {t("settings.ruleStyle")}
              </label>
              <select id={`cs-${r.id}`} className="input" value={r.style} onChange={(e) => setRule(i, { ...r, style: e.target.value as CardRule["style"] })}>
                <option value="border">{t("settings.style.border")}</option>
                <option value="background">{t("settings.style.background")}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`cc-${r.id}`}>
                {t("settings.color")}
              </label>
              <input id={`cc-${r.id}`} type="color" className="h-8 w-12 rounded border border-line-strong" value={r.color} onChange={(e) => setRule(i, { ...r, color: e.target.value })} />
            </div>
            <button type="button" className="icon-btn" aria-label={`${t("common.remove")} ${r.name}`} onClick={() => setCfg({ ...cfg, rules: cfg.rules.filter((_, j) => j !== i) })}>
              🗑
            </button>
          </div>
          <ConditionEditor value={r.when} onChange={(g) => setRule(i, { ...r, when: g })} />
        </section>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCfg({ ...cfg, rules: [...cfg.rules, { id: newId(), name: "New rule", style: "border", color: "#dc2626", enabled: true, when: { logic: "and", clauses: [] } }] })}
        >
          + {t("settings.addRule")}
        </button>
      </div>
      <SaveBar pending={pending} onSave={save} />
    </div>
  );
}
