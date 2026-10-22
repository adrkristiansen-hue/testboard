"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MessageKey } from "@/lib/i18n";
import type { FieldDef, FieldKind } from "@/lib/fields";
import type { TypeLite } from "@/lib/types";
import { STATE_CATEGORIES, CATEGORY_COLORS, type StateCategory } from "@/lib/workflow";
import { toDateInput } from "@/lib/format";
import type { ActionResult } from "@/server/result";
import { deleteModule, deletePhase, deleteTeam, moveModule, saveModule, savePhase, saveProjectAsTemplate, saveTeam, saveType, updateProject } from "@/server/actions/config";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";
import { TypeIcon } from "../ui/TypeIcon";
import { AccessSettings } from "./AccessSettings";
import type { AccessData } from "@/server/access-admin";
import type { Permission } from "@/lib/permissions";

type Tab = "general" | "modules" | "phases" | "teams" | "types" | "access";

interface TeamCfg {
  id: string;
  name: string;
  memberIds: string[];
  modules: { moduleId: string; includeChildren: boolean }[];
}

function useAction() {
  const toast = useToast();
  const router = useRouter();
  const t = useT();
  const [pending, start] = useTransition();
  const exec = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error, "error");
      toast(t("common.saved"), "success");
      onOk?.(res.data);
      router.refresh();
    });
  return { pending, exec };
}

export function ProjectSettings({ description, teams, typeUsage, accessData }: { description: string; teams: TeamCfg[]; typeUsage: Record<string, number>; accessData: AccessData | null }) {
  const t = useT();
  const { meta, can } = useProject();
  // Only the tabs the user's project role may change.
  const tabs = ([
    { key: "general", label: "settings.general", need: "project.configure" },
    { key: "modules", label: "settings.modules", need: "project.configure" },
    { key: "phases", label: "settings.phases", need: "project.configure" },
    { key: "teams", label: "settings.teams", need: "boards.configure" },
    { key: "types", label: "settings.types", need: "project.configure" },
    { key: "access", label: "settings.access", need: "access.manage" },
  ] as { key: Tab; label: MessageKey; need: Permission }[]).filter((x) => can(x.need) && (x.key !== "access" || accessData));
  const [tab, setTab] = useState<Tab>(tabs.find((x) => x.key === "modules")?.key ?? tabs[0]?.key ?? "modules");
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <h1 className="mb-3 text-lg font-semibold">
        {t("settings.title")} – {meta.name}
      </h1>
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tb) => (
          <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)} className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-sm ${tab === tb.key ? "border-brand font-semibold" : "border-transparent text-ink-muted"}`}>
            {t(tb.label)}
          </button>
        ))}
      </div>
      {tab === "general" && <General description={description} />}
      {tab === "modules" && <Modules />}
      {tab === "phases" && <Phases />}
      {tab === "teams" && <Teams teams={teams} />}
      {tab === "types" && <Types usage={typeUsage} />}
      {tab === "access" && accessData && <AccessSettings data={accessData} />}
    </main>
  );
}

function General({ description }: { description: string }) {
  return (
    <div className="flex flex-col gap-4">
      <GeneralForm description={description} />
      <SaveAsTemplate />
    </div>
  );
}

function SaveAsTemplate() {
  const t = useT();
  const { meta } = useProject();
  const { pending, exec } = useAction();
  const [name, setName] = useState(`${meta.name} – process`);
  const [desc, setDesc] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="card-panel flex max-w-xl flex-col gap-3 p-4"
      aria-labelledby="tpl-h"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => saveProjectAsTemplate(meta.id, { name, description: desc }), () => setSaved(true));
      }}
    >
      <h2 id="tpl-h" className="font-semibold">
        {t("settings.saveAsTemplate")}
      </h2>
      <p className="text-sm text-ink-muted">{t("template.saveHint")}</p>
      <div>
        <label className="label" htmlFor="tpl-name">
          {t("template.name")}
        </label>
        <input id="tpl-name" className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="tpl-desc">
          {t("field.description")}
        </label>
        <textarea id="tpl-desc" className="input min-h-16" value={desc} maxLength={1000} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-secondary" disabled={pending || !name.trim()}>
          {t("settings.saveAsTemplate")}
        </button>
        {saved && (
          <span role="status" className="text-sm text-[#006300]">
            ✓ {t("template.saved")}
          </span>
        )}
      </div>
    </form>
  );
}

function GeneralForm({ description }: { description: string }) {
  const t = useT();
  const { meta } = useProject();
  const { pending, exec } = useAction();
  const [name, setName] = useState(meta.name);
  const [desc, setDesc] = useState(description);
  return (
    <form
      className="card-panel flex max-w-xl flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => updateProject(meta.id, { name, description: desc }));
      }}
    >
      <div>
        <label className="label" htmlFor="pname">
          {t("settings.projectName")}
        </label>
        <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <span className="label">{t("settings.projectKey")}</span>
        <div className="font-mono">{meta.key}</div>
      </div>
      <div>
        <label className="label" htmlFor="pdesc">
          {t("field.description")}
        </label>
        <textarea id="pdesc" className="input min-h-20" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}

function Modules() {
  const t = useT();
  const { meta } = useProject();
  const { pending, exec } = useAction();
  const [editing, setEditing] = useState<{ id?: string; name: string; parentId: string | null } | null>(null);
  const depth = (id: string | null): number => {
    let d = 0;
    let cur = id ? meta.modules.find((m) => m.id === id) : undefined;
    while (cur?.parentId) {
      d++;
      cur = meta.modules.find((m) => m.id === cur!.parentId);
    }
    return d;
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">Modules work like Azure Boards area paths: a tree used to group, filter and route work to team boards.</p>
      <ul className="card-panel divide-y divide-line" aria-label={t("settings.modules")}>
        {meta.modules.map((m) => (
          <li key={m.id} className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: 12 + depth(m.id) * 24 }}>
            <span aria-hidden="true" className="text-ink-muted">
              {depth(m.id) > 0 ? "└" : "▪"}
            </span>
            <span className="flex-1">{m.name}</span>
            <button type="button" className="icon-btn" aria-label={`${t("common.moveUp")} ${m.name}`} onClick={() => exec(() => moveModule(m.id, -1))}>
              ↑
            </button>
            <button type="button" className="icon-btn" aria-label={`${t("common.moveDown")} ${m.name}`} onClick={() => exec(() => moveModule(m.id, 1))}>
              ↓
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ name: "", parentId: m.id })}>
              + {t("settings.addSubModule")}
            </button>
            <button type="button" className="icon-btn" aria-label={`${t("common.edit")} ${m.name}`} onClick={() => setEditing({ id: m.id, name: m.name, parentId: m.parentId })}>
              ✎
            </button>
            <button type="button" className="icon-btn" aria-label={`${t("common.delete")} ${m.name}`} onClick={() => confirm(t("common.confirmDelete")) && exec(() => deleteModule(m.id))}>
              🗑
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <form
          className="card-panel flex flex-wrap items-end gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            exec(() => saveModule(meta.id, editing), () => setEditing(null));
          }}
        >
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="mname">
              {t("common.name")}
            </label>
            <input id="mname" autoFocus className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="min-w-48">
            <label className="label" htmlFor="mparent">
              {t("field.parent")}
            </label>
            <select id="mparent" className="input" value={editing.parentId ?? ""} onChange={(e) => setEditing({ ...editing, parentId: e.target.value || null })}>
              <option value="">—</option>
              {meta.modules
                .filter((m) => m.id !== editing.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.path}
                  </option>
                ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {t("common.save")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing({ name: "", parentId: null })}>
            + {t("settings.addModule")}
          </button>
        </div>
      )}
    </div>
  );
}

function Phases() {
  const t = useT();
  const { meta } = useProject();
  const { pending, exec } = useAction();
  const [rows, setRows] = useState(meta.phases.map((p) => ({ id: p.id as string | undefined, name: p.name, startDate: toDateInput(p.startDate), endDate: toDateInput(p.endDate), requireApprovedScripts: !!p.requireApprovedScripts })));
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">Phases work like Azure Boards iterations (e.g. SIT 1, SIT 2, UAT, Hypercare).</p>
      <div className="card-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="p-2">{t("common.name")}</th>
              <th className="p-2">{t("settings.startDate")}</th>
              <th className="p-2">{t("settings.endDate")}</th>
              <th className="p-2">{t("settings.requireApproved")}</th>
              <th className="p-2">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id ?? `new${i}`} className="border-b border-line">
                <td className="p-2">
                  <input aria-label={t("common.name")} className="input" value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label={t("settings.startDate")} type="date" className="input" value={p.startDate} onChange={(e) => update(i, { startDate: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label={t("settings.endDate")} type="date" className="input" value={p.endDate} onChange={(e) => update(i, { endDate: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label={`${t("settings.requireApproved")} ${p.name}`} title={t("settings.requireApprovedHint")} type="checkbox" checked={p.requireApprovedScripts} onChange={(e) => update(i, { requireApprovedScripts: e.target.checked })} />
                </td>
                <td className="whitespace-nowrap p-2">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => exec(() => savePhase(meta.id, { id: p.id, name: p.name, startDate: p.startDate || null, endDate: p.endDate || null, requireApprovedScripts: p.requireApprovedScripts }))}>
                    {t("common.save")}
                  </button>
                  {p.id && (
                    <button type="button" className="icon-btn ml-1" aria-label={`${t("common.delete")} ${p.name}`} onClick={() => confirm(t("common.confirmDelete")) && exec(() => deletePhase(p.id!), () => setRows((r) => r.filter((_, j) => j !== i)))}>
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button type="button" className="btn btn-secondary" onClick={() => setRows((r) => [...r, { id: undefined, name: "Hypercare", startDate: "", endDate: "", requireApprovedScripts: false }])}>
          + {t("settings.addPhase")}
        </button>
      </div>
    </div>
  );
}

function Teams({ teams }: { teams: TeamCfg[] }) {
  const t = useT();
  const { meta } = useProject();
  const { pending, exec } = useAction();
  const [list, setList] = useState(teams);
  const update = (i: number, patch: Partial<TeamCfg>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">A team subscribes to modules; its board shows work items in those modules.</p>
      {list.map((team, i) => (
        <section key={team.id || `new${i}`} className="card-panel p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor={`tn-${i}`}>
                {t("common.name")}
              </label>
              <input id={`tn-${i}`} className="input" value={team.name} onChange={(e) => update(i, { name: e.target.value })} />
            </div>
            {team.id && (
              <Link className="btn btn-ghost btn-sm" href={`/p/${meta.id}/boards/${team.id}/settings`}>
                {t("board.settings")}
              </Link>
            )}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <fieldset>
              <legend className="label">{t("settings.members")}</legend>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {meta.users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={team.memberIds.includes(u.id)} onChange={(e) => update(i, { memberIds: e.target.checked ? [...team.memberIds, u.id] : team.memberIds.filter((x) => x !== u.id) })} />
                    {u.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">{t("settings.teamModules")}</legend>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {meta.modules.map((m) => {
                  const sub = team.modules.find((x) => x.moduleId === m.id);
                  return (
                    <div key={m.id} className="flex items-center gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!sub}
                          onChange={(e) => update(i, { modules: e.target.checked ? [...team.modules, { moduleId: m.id, includeChildren: true }] : team.modules.filter((x) => x.moduleId !== m.id) })}
                        />
                        {m.path}
                      </label>
                      {sub && meta.modules.some((c) => c.parentId === m.id) && (
                        <label className="flex items-center gap-1 text-xs text-ink-muted">
                          <input type="checkbox" checked={sub.includeChildren} onChange={(e) => update(i, { modules: team.modules.map((x) => (x.moduleId === m.id ? { ...x, includeChildren: e.target.checked } : x)) })} />
                          {t("settings.includeChildren")}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => exec(() => saveTeam(meta.id, { id: team.id || undefined, name: team.name, memberIds: team.memberIds, modules: team.modules }), (d) => update(i, { id: d.id }))}>
              {t("common.save")}
            </button>
            {team.id && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => confirm(t("common.confirmDelete")) && exec(() => deleteTeam(team.id), () => setList((l) => l.filter((_, j) => j !== i)))}>
                {t("common.delete")}
              </button>
            )}
          </div>
        </section>
      ))}
      <div>
        <button type="button" className="btn btn-secondary" onClick={() => setList((l) => [...l, { id: "", name: "New team", memberIds: [], modules: [] }])}>
          + {t("settings.addTeam")}
        </button>
      </div>
    </div>
  );
}

interface TypeDraft {
  id?: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  disabled: boolean;
  states: { name: string; category: StateCategory; color: string; original?: string }[];
  transitions: Record<string, string[]>;
  fields: FieldDef[];
}

function toDraft(ty: TypeLite): TypeDraft {
  return {
    id: ty.id,
    key: ty.key,
    name: ty.name,
    icon: ty.icon,
    color: ty.color,
    disabled: ty.disabled,
    states: ty.states.map((s) => ({ name: s.name, category: s.category, color: s.color, original: s.name })),
    transitions: ty.transitions,
    fields: ty.fields,
  };
}

function Types({ usage }: { usage: Record<string, number> }) {
  const t = useT();
  const { meta } = useProject();
  const [selected, setSelected] = useState<string>(meta.types[0]?.id ?? "new");
  const current = meta.types.find((x) => x.id === selected);
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <nav aria-label={t("settings.types")}>
        <ul className="card-panel divide-y divide-line">
          {meta.types.map((ty) => (
            <li key={ty.id}>
              <button type="button" aria-current={selected === ty.id} onClick={() => setSelected(ty.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${selected === ty.id ? "bg-brand-soft font-semibold" : "hover:bg-gray-50"}`}>
                <TypeIcon type={ty} size={16} />
                <span className="flex-1">{ty.name}</span>
                <span className="text-xs text-ink-muted">{usage[ty.id] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary mt-2 w-full justify-center" onClick={() => setSelected("new")}>
          + {t("settings.addType")}
        </button>
      </nav>
      <TypeEditor
        key={selected}
        initial={
          current
            ? toDraft(current)
            : { key: "", name: "", icon: "■", color: "#475569", disabled: false, states: [{ name: "New", category: "PROPOSED", color: CATEGORY_COLORS.PROPOSED }, { name: "Active", category: "IN_PROGRESS", color: CATEGORY_COLORS.IN_PROGRESS }, { name: "Done", category: "COMPLETED", color: CATEGORY_COLORS.COMPLETED }], transitions: {}, fields: [] }
        }
        onSaved={(id) => setSelected(id)}
      />
    </div>
  );
}

function TypeEditor({ initial, onSaved }: { initial: TypeDraft; onSaved: (id: string) => void }) {
  const t = useT();
  const { meta } = useProject();
  const { pending, exec } = useAction();
  const [d, setD] = useState(initial);
  const isNew = !d.id;
  const setState = (i: number, patch: Partial<TypeDraft["states"][number]>) => setD({ ...d, states: d.states.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setFieldDef = (i: number, patch: Partial<FieldDef>) => setD({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const moveState = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= d.states.length) return;
    const n = [...d.states];
    [n[i], n[j]] = [n[j], n[i]];
    setD({ ...d, states: n });
  };

  const save = () => {
    const renames: Record<string, string> = {};
    for (const s of d.states) if (s.original && s.original !== s.name) renames[s.original] = s.name;
    // Rename keys/targets in transitions too
    const rn = (s: string) => renames[s] ?? s;
    const transitions = Object.fromEntries(Object.entries(d.transitions).map(([from, tos]) => [rn(from), tos.map(rn)]));
    exec(
      () =>
        saveType(meta.id, {
          id: d.id,
          key: d.key,
          name: d.name,
          icon: d.icon,
          color: d.color,
          disabled: d.disabled,
          states: d.states.map(({ name, category, color }) => ({ name, category, color })),
          transitions,
          fields: d.fields.map((f) => ({ ...f, labelNb: f.labelNb || undefined, options: f.kind === "select" ? f.options ?? [] : undefined })),
          renames,
        }),
      (res) => onSaved(res.id),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="card-panel grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="tyname">
            {t("common.name")}
          </label>
          <input id="tyname" className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="tykey">
            {t("settings.fieldKey")}
          </label>
          <input id="tykey" className="input font-mono" value={d.key} disabled={!isNew} onChange={(e) => setD({ ...d, key: e.target.value.toUpperCase() })} placeholder="RISK" />
        </div>
        <div className="flex gap-2">
          <div>
            <label className="label" htmlFor="tyicon">
              {t("settings.icon")}
            </label>
            <input id="tyicon" className="input w-14 text-center" maxLength={3} value={d.icon} onChange={(e) => setD({ ...d, icon: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="tycolor">
              {t("settings.color")}
            </label>
            <input id="tycolor" type="color" className="h-8 w-12 rounded border border-line-strong" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
          <input type="checkbox" checked={d.disabled} onChange={(e) => setD({ ...d, disabled: e.target.checked })} />
          {t("settings.disabled")}
        </label>
      </section>

      <section className="card-panel p-3" aria-labelledby="wf-h">
        <h2 id="wf-h" className="mb-2 text-sm font-semibold">
          {t("settings.workflow")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="p-1">{t("field.state")}</th>
                <th className="p-1">{t("field.category")}</th>
                <th className="p-1">{t("settings.color")}</th>
                <th className="p-1">{t("settings.transitions")}</th>
                <th className="p-1">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.states.map((s, i) => {
                const key = s.original ?? s.name;
                const allowed = d.transitions[key] ?? [];
                return (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="p-1">
                      <input aria-label={t("field.state")} className="input" value={s.name} onChange={(e) => setState(i, { name: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <select aria-label={t("field.category")} className="input" value={s.category} onChange={(e) => setState(i, { category: e.target.value as StateCategory })}>
                        {STATE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {t(`category.${c}` as MessageKey)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <input aria-label={t("settings.color")} type="color" className="h-8 w-12 rounded border border-line-strong" value={s.color} onChange={(e) => setState(i, { color: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <div className="flex flex-wrap gap-x-2">
                        {d.states
                          .filter((o) => o !== s)
                          .map((o) => {
                            const oKey = o.original ?? o.name;
                            return (
                              <label key={oKey} className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={allowed.includes(oKey)}
                                  onChange={(e) => setD({ ...d, transitions: { ...d.transitions, [key]: e.target.checked ? [...allowed, oKey] : allowed.filter((x) => x !== oKey) } })}
                                />
                                {o.name}
                              </label>
                            );
                          })}
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-1">
                      <button type="button" className="icon-btn" aria-label={`${t("common.moveUp")} ${s.name}`} onClick={() => moveState(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="icon-btn" aria-label={`${t("common.moveDown")} ${s.name}`} onClick={() => moveState(i, 1)}>
                        ↓
                      </button>
                      <button type="button" className="icon-btn" aria-label={`${t("common.remove")} ${s.name}`} onClick={() => setD({ ...d, states: d.states.filter((_, j) => j !== i) })}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => setD({ ...d, states: [...d.states, { name: "", category: "IN_PROGRESS", color: CATEGORY_COLORS.IN_PROGRESS }] })}>
          + {t("settings.addState")}
        </button>
      </section>

      <section className="card-panel p-3" aria-labelledby="fd-h">
        <h2 id="fd-h" className="mb-2 text-sm font-semibold">
          {t("settings.fields")}
        </h2>
        <p className="mb-2 text-xs text-ink-muted">Common fields (title, state, assignee, module, phase, priority, severity, tags, due date) exist on every type. Add type-specific fields here.</p>
        <div className="flex flex-col gap-2">
          {d.fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
              <div>
                <label className="label" htmlFor={`fk-${i}`}>
                  {t("settings.fieldKey")}
                </label>
                <input id={`fk-${i}`} className="input w-32 font-mono" value={f.key} onChange={(e) => setFieldDef(i, { key: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`fl-${i}`}>
                  {t("settings.fieldLabel")} (EN)
                </label>
                <input id={`fl-${i}`} className="input w-44" value={f.label} onChange={(e) => setFieldDef(i, { label: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`fn-${i}`}>
                  {t("settings.fieldLabel")} (NO)
                </label>
                <input id={`fn-${i}`} className="input w-44" value={f.labelNb ?? ""} onChange={(e) => setFieldDef(i, { labelNb: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`fkind-${i}`}>
                  {t("settings.fieldKind")}
                </label>
                <select id={`fkind-${i}`} className="input" value={f.kind} onChange={(e) => setFieldDef(i, { kind: e.target.value as FieldKind })}>
                  {(["text", "richtext", "select", "number", "date", "steps"] as FieldKind[]).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              {f.kind === "select" && (
                <div className="min-w-48 flex-1">
                  <label className="label" htmlFor={`fo-${i}`}>
                    {t("settings.fieldOptions")}
                  </label>
                  <input id={`fo-${i}`} className="input" value={(f.options ?? []).join(", ")} onChange={(e) => setFieldDef(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                </div>
              )}
              <button type="button" className="icon-btn" aria-label={`${t("common.remove")} ${f.label}`} onClick={() => setD({ ...d, fields: d.fields.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => setD({ ...d, fields: [...d.fields, { key: "", label: "", kind: "text" }] })}>
          + {t("settings.addField")}
        </button>
      </section>
      <div>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}
