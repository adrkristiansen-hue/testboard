"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ItemDetail } from "@/lib/detail-types";
import type { FieldDef, TestStep } from "@/lib/fields";
import type { MessageKey } from "@/lib/i18n";
import type { RtDoc } from "@/lib/richtext";
import type { TypeLite } from "@/lib/types";
import { allowedTargets } from "@/lib/workflow";
import { toDateInput, formatDateTime } from "@/lib/format";
import { defectDefaultsFromTest, type NewItemDefaults } from "@/lib/prefill";
import { createItem, deleteItem, getItemDetail, toggleFollow, updateItem } from "@/server/actions/items";
import type { ItemPatch } from "@/server/workitems";
import { useProject } from "../ProjectProvider";
import { useI18n } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { useToast } from "../ui/Toast";
import { TypeIcon, StateDot } from "../ui/TypeIcon";
import { UserSelect } from "../ui/UserSelect";
import { TagInput } from "../ui/TagInput";
import { Popover, MenuItem } from "../ui/Popover";
import { RichTextEditor } from "../editor/RichTextEditor";
import { RichText } from "../editor/RichText";
import { StepsEditor } from "./StepsEditor";
import { Discussion } from "./Discussion";
import { History } from "./History";
import { Links } from "./Links";
import { Attachments } from "./Attachments";
import { useShortcuts } from "../useShortcuts";

interface Draft {
  typeId: string;
  title: string;
  description: RtDoc | null;
  state: string;
  assignedToId: string | null;
  moduleId: string | null;
  phaseId: string | null;
  priority: number;
  severity: number | null;
  tags: string[];
  dueDate: string;
  parentId: number | null;
  fields: Record<string, unknown>;
}

type Tab = "details" | "history" | "links" | "attachments";

export interface WorkItemFormProps {
  itemId: number | null;
  newDefaults?: NewItemDefaults;
  variant: "panel" | "page";
  onClose?: () => void;
  /** Called after any persisted change (board refresh). */
  onSaved?: () => void;
  onCreated?: (id: number) => void;
  onOpenItem?: (id: number) => void;
  onNewItem?: (defaults: NewItemDefaults) => void;
  /** Report unsaved changes to the container (to confirm before closing). */
  onDirtyChange?: (dirty: boolean) => void;
}

function draftFromDetail(d: ItemDetail): Draft {
  const i = d.item;
  return {
    typeId: i.typeId,
    title: i.title,
    description: i.description,
    state: i.state,
    assignedToId: i.assignedToId,
    moduleId: i.moduleId,
    phaseId: i.phaseId,
    priority: i.priority,
    severity: i.severity,
    tags: i.tags,
    dueDate: toDateInput(i.dueDate),
    parentId: i.parentId,
    fields: i.fields,
  };
}

function newDraft(nd: NewItemDefaults | undefined, types: TypeLite[], typeById: Map<string, TypeLite>): Draft {
  const d = nd ?? {};
  const typeId = d.typeId ?? types.find((x) => !x.disabled)?.id ?? "";
  const type = typeById.get(typeId);
  return {
    typeId,
    title: d.title ?? "",
    description: d.description ?? null,
    state: d.state ?? type?.states[0]?.name ?? "",
    assignedToId: d.assignedToId ?? null,
    moduleId: d.moduleId ?? null,
    phaseId: d.phaseId ?? null,
    priority: d.priority ?? 2,
    severity: d.severity ?? (type?.key === "DEFECT" ? 3 : null),
    tags: d.tags ?? [],
    dueDate: "",
    parentId: d.parentId ?? null,
    fields: d.fields ?? {},
  };
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function WorkItemForm(props: WorkItemFormProps) {
  const { itemId, variant } = props;
  const { t, locale } = useI18n();
  const { meta, typeById, userById } = useProject();
  const { user, canEdit, canConfigure } = useSessionUser();
  const toast = useToast();
  const router = useRouter();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The form is keyed by item id by its container, so state initialises once per item.
  const [draft, setDraft] = useState<Draft | null>(() => (itemId === null ? newDraft(props.newDefaults, meta.types, typeById) : null));
  const [base, setBase] = useState<Draft | null>(draft);
  const [tab, setTab] = useState<Tab>("details");
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Remount rich text editors when the underlying item reloads from the server.
  const [editorGen, setEditorGen] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const isNew = itemId === null;

  const applyDetail = useCallback(
    (res: Awaited<ReturnType<typeof getItemDetail>>, resetDraft: boolean) => {
      if (!res.ok) {
        setLoadError(res.code === "NOT_FOUND" ? t("item.notFound") : res.error);
        return;
      }
      setLoadError(null);
      setDetail(res.data);
      if (resetDraft) {
        const d = draftFromDetail(res.data);
        setDraft(d);
        setBase(d);
        setEditorGen((g) => g + 1);
      }
    },
    [t],
  );

  const load = useCallback(
    async (resetDraft: boolean) => {
      if (itemId === null) return;
      applyDetail(await getItemDetail(itemId), resetDraft);
    },
    [itemId, applyDetail],
  );

  // Load existing items; focus the title for new ones.
  useEffect(() => {
    if (itemId === null) {
      titleRef.current?.focus();
      return;
    }
    let cancelled = false;
    getItemDetail(itemId).then((res) => {
      if (!cancelled) applyDetail(res, true);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, applyDetail]);

  const type: TypeLite | undefined = draft ? typeById.get(draft.typeId) : undefined;
  const dirty = !!draft && !!base && !same(draft, base);
  const { onDirtyChange } = props;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setField = (key: string, value: unknown) => setDraft((d) => (d ? { ...d, fields: { ...d.fields, [key]: value } } : d));

  const stateOptions = useMemo(() => {
    if (!type || !draft) return [];
    if (isNew) return type.states.map((s) => s.name);
    const current = base?.state ?? draft.state;
    return [current, ...allowedTargets({ states: type.states, transitions: type.transitions }, current)];
  }, [type, draft, base, isNew]);

  const save = () => {
    if (!draft || !canEdit) return;
    if (!draft.title.trim()) {
      setError(t("item.titleRequired"));
      titleRef.current?.focus();
      return;
    }
    setError(null);
    startSave(async () => {
      if (isNew) {
        const res = await createItem({
          projectId: meta.id,
          typeId: draft.typeId,
          title: draft.title,
          description: draft.description,
          state: draft.state,
          assignedToId: draft.assignedToId,
          moduleId: draft.moduleId,
          phaseId: draft.phaseId,
          priority: draft.priority,
          severity: draft.severity,
          tags: draft.tags,
          dueDate: draft.dueDate || null,
          parentId: draft.parentId,
          fields: draft.fields,
        });
        if (!res.ok) return setError(res.error);
        toast(t("item.created", { id: res.data.id }), "success");
        setBase(draft);
        props.onSaved?.();
        props.onCreated?.(res.data.id);
        return;
      }
      if (!base) return;
      const patch: ItemPatch = {};
      const keys: (keyof Draft)[] = ["title", "description", "state", "assignedToId", "moduleId", "phaseId", "priority", "severity", "tags", "parentId"];
      for (const k of keys) if (!same(draft[k], base[k])) (patch as Record<string, unknown>)[k] = draft[k];
      if (draft.dueDate !== base.dueDate) patch.dueDate = draft.dueDate || null;
      const changedFields: Record<string, unknown> = {};
      for (const k of new Set([...Object.keys(draft.fields), ...Object.keys(base.fields)])) if (!same(draft.fields[k], base.fields[k])) changedFields[k] = draft.fields[k] ?? null;
      if (Object.keys(changedFields).length) patch.fields = changedFields;
      const res = await updateItem(itemId!, patch);
      if (!res.ok) return setError(res.error);
      toast(t("common.saved"), "success");
      await load(true);
      props.onSaved?.();
    });
  };

  // Ctrl/Cmd+S saves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const refreshAfterSideEffect = async () => {
    await load(false);
    props.onSaved?.();
  };

  const onFollow = async () => {
    if (!itemId) return;
    const res = await toggleFollow(itemId);
    if (!res.ok) return toast(res.error, "error");
    setDetail((d) => (d ? { ...d, following: res.data.following } : d));
  };

  const onDelete = async () => {
    if (!itemId || !confirm(t("common.confirmDelete"))) return;
    const res = await deleteItem(itemId);
    if (!res.ok) return toast(res.error, "error");
    props.onSaved?.();
    if (props.onClose) props.onClose();
    else router.push(`/p/${meta.id}/items`);
  };

  // "e" edits the title, "a" assigns to me; Ctrl/Cmd+Enter saves even while typing.
  useShortcuts(
    {
      e: () => {
        titleRef.current?.focus();
        titleRef.current?.select();
      },
      a: () => {
        if (draft && draft.assignedToId !== user.id) set("assignedToId", user.id);
      },
    },
    canEdit,
  );
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && rootRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit]);

  const createDefect = () => {
    if (!detail) return;
    const defaults = defectDefaultsFromTest(detail.item, meta.types);
    if (props.onNewItem) props.onNewItem(defaults);
    else router.push(`/p/${meta.id}/items/new?from=${detail.item.id}`);
  };

  if (loadError) {
    return (
      <div className="p-6">
        <p role="alert" className="text-danger">
          {loadError}
        </p>
        {props.onClose && (
          <button type="button" className="btn btn-secondary mt-3" onClick={props.onClose}>
            {t("common.close")}
          </button>
        )}
      </div>
    );
  }
  if (!draft) return <div className="p-6 text-ink-muted">{t("common.loading")}</div>;

  const ro = !canEdit;
  const stateDef = type?.states.find((s) => s.name === draft.state);
  const fieldLabel = (f: FieldDef) => (locale === "nb" && f.labelNb ? f.labelNb : f.label);
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "details", label: t("item.details") },
    ...(isNew
      ? []
      : ([
          { key: "history", label: t("item.history"), count: detail?.history.length },
          { key: "links", label: t("item.links"), count: detail?.links.length },
          { key: "attachments", label: t("item.attachments"), count: detail?.attachments.length },
        ] as { key: Tab; label: string; count?: number }[])),
  ];
  const idp = `wi-${itemId ?? "new"}`;

  return (
    <div ref={rootRef} className="@container flex h-full min-h-0 flex-col bg-canvas">
      {/* Header */}
      <div className="border-b border-line bg-white px-4 pb-2 pt-3" style={{ borderTop: `4px solid ${type?.color ?? "#999"}` }}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <TypeIcon type={type} size={16} />
          {isNew ? (
            <select aria-label={t("field.type")} className="rounded border border-line-strong bg-white px-1 py-0.5 text-xs normal-case" value={draft.typeId} onChange={(e) => {
              const nt = typeById.get(e.target.value);
              setDraft((d) => d && { ...d, typeId: e.target.value, state: nt?.states[0]?.name ?? "", severity: nt?.key === "DEFECT" ? (d.severity ?? 3) : null });
            }}>
              {meta.types.filter((x) => !x.disabled).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ) : (
            <span>
              {type?.name} {itemId}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1 normal-case">
            {!isNew && detail && type?.key === "TEST_TASK" && canEdit && detail.item.fields.outcome === "Failed" && (
              <button type="button" className="btn btn-sm btn-danger" onClick={createDefect}>
                + {t("item.defectFromFailure")}
              </button>
            )}
            {!isNew && detail && (
              <button type="button" className={`btn btn-sm ${detail.following ? "btn-secondary" : "btn-ghost"}`} aria-pressed={detail.following} onClick={onFollow}>
                {detail.following ? "★ " + t("item.unfollow") : "☆ " + t("item.follow")}
              </button>
            )}
            {!isNew && (
              <Popover label={t("common.more")} trigger={<span aria-hidden="true">⋯</span>} align="right">
                {(close) => (
                  <div className="w-52">
                    {variant === "panel" && (
                      <Link href={`/p/${meta.id}/items/${itemId}`} className="flex rounded px-2 py-1.5 text-sm hover:bg-brand-soft">
                        {t("item.openFull")}
                      </Link>
                    )}
                    <MenuItem
                      onClick={() => {
                        void navigator.clipboard?.writeText(`${location.origin}/p/${meta.id}/items/${itemId}`);
                        close();
                      }}
                    >
                      {t("item.copyLink")}
                    </MenuItem>
                    {type?.key === "TEST_TASK" && canEdit && (
                      <MenuItem onClick={() => { close(); createDefect(); }}>{t("item.createDefect")}</MenuItem>
                    )}
                    {canConfigure && (
                      <MenuItem onClick={() => { close(); void onDelete(); }}>
                        <span className="text-danger">{t("common.delete")}</span>
                      </MenuItem>
                    )}
                  </div>
                )}
              </Popover>
            )}
            {props.onClose && (
              <button type="button" className="icon-btn" aria-label={t("common.close")} title={`${t("common.close")} (Esc)`} onClick={props.onClose}>
                ✕
              </button>
            )}
          </div>
        </div>
        <label htmlFor={`${idp}-title`} className="sr-only">
          {t("field.title")}
        </label>
        <input
          ref={titleRef}
          id={`${idp}-title`}
          className="mt-1 w-full rounded border border-transparent px-1 py-1 text-lg font-semibold hover:border-line-strong focus:border-brand"
          value={draft.title}
          readOnly={ro}
          placeholder={t("field.title")}
          onChange={(e) => set("title", e.target.value)}
          aria-invalid={!!error && !draft.title.trim()}
        />
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="min-w-40">
            <label htmlFor={`${idp}-state`} className="label">
              {t("field.state")}
            </label>
            <div className="flex items-center gap-1.5">
              <StateDot color={stateDef?.color ?? "#999"} />
              <select id={`${idp}-state`} className="input" value={draft.state} disabled={ro} onChange={(e) => set("state", e.target.value)}>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="min-w-44">
            <label htmlFor={`${idp}-assignee`} className="label">
              {t("field.assignedTo")}
            </label>
            <UserSelect id={`${idp}-assignee`} users={meta.users} value={draft.assignedToId} onChange={(v) => set("assignedToId", v)} disabled={ro} unassignedLabel={t("common.unassigned")} />
          </div>
          {canEdit && draft.assignedToId !== user.id && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("assignedToId", user.id)}>
              {t("board.assignToMe")}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-xs text-warn">●</span>}
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving || (!dirty && !isNew)}>
                {saving ? t("common.saving") : isNew ? t("common.create") : t("common.save")}
              </button>
            )}
          </div>
        </div>
        {ro && <p className="mt-1 text-xs text-ink-muted">{t("common.readOnly")}</p>}
        {error && (
          <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-danger">
            {error}
          </p>
        )}
        <div role="tablist" aria-label={t("item.details")} className="-mb-2 mt-2 flex gap-1 overflow-x-auto">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              role="tab"
              id={`${idp}-tab-${tb.key}`}
              aria-selected={tab === tb.key}
              aria-controls={`${idp}-panel`}
              onClick={() => setTab(tb.key)}
              className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-sm ${tab === tb.key ? "border-brand font-semibold text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              {tb.label}
              {tb.count !== undefined && tb.count > 0 && <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-xs">{tb.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div id={`${idp}-panel`} role="tabpanel" aria-labelledby={`${idp}-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
        {tab === "details" && (
          <div className={`grid gap-4 p-4 ${variant === "page" ? "@5xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
            <div className="grid min-w-0 gap-4 @2xl:grid-cols-[minmax(0,1fr)_240px]">
              {/* Main column */}
              <div className="flex min-w-0 flex-col gap-4">
                <div>
                  <span className="label" id={`${idp}-desc-l`}>
                    {t("field.description")}
                  </span>
                  {ro ? (
                    <div className="card-panel p-3">
                      <RichText doc={draft.description} projectId={meta.id} />
                    </div>
                  ) : (
                    <RichTextEditor key={`desc-${editorGen}`} value={draft.description} onChange={(d) => set("description", d)} workItemId={itemId ?? undefined} ariaLabel={t("field.description")} />
                  )}
                </div>
                {type?.fields.map((f) => (
                  <CustomField key={`${f.key}-${editorGen}`} def={f} label={fieldLabel(f)} value={draft.fields[f.key]} onChange={(v) => setField(f.key, v)} readOnly={ro} idp={idp} itemId={itemId} projectId={meta.id} />
                ))}
              </div>
              {/* Side fields */}
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor={`${idp}-module`} className="label">
                    {t("field.module")}
                  </label>
                  <select id={`${idp}-module`} className="input" value={draft.moduleId ?? ""} disabled={ro} onChange={(e) => set("moduleId", e.target.value || null)}>
                    <option value="">{t("common.noModule")}</option>
                    {meta.modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.path}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${idp}-phase`} className="label">
                    {t("field.phase")}
                  </label>
                  <select id={`${idp}-phase`} className="input" value={draft.phaseId ?? ""} disabled={ro} onChange={(e) => set("phaseId", e.target.value || null)}>
                    <option value="">{t("common.noPhase")}</option>
                    {meta.phases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${idp}-prio`} className="label">
                      {t("field.priority")}
                    </label>
                    <select id={`${idp}-prio`} className="input" value={draft.priority} disabled={ro} onChange={(e) => set("priority", Number(e.target.value))}>
                      {[1, 2, 3, 4].map((p) => (
                        <option key={p} value={p}>
                          {t(`priority.${p}` as MessageKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${idp}-sev`} className="label">
                      {t("field.severity")}
                    </label>
                    <select id={`${idp}-sev`} className="input" value={draft.severity ?? ""} disabled={ro} onChange={(e) => set("severity", e.target.value ? Number(e.target.value) : null)}>
                      <option value="">—</option>
                      {[1, 2, 3, 4].map((p) => (
                        <option key={p} value={p}>
                          {t(`severity.${p}` as MessageKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor={`${idp}-due`} className="label">
                    {t("field.dueDate")}
                  </label>
                  <input id={`${idp}-due`} type="date" className="input" value={draft.dueDate} disabled={ro} onChange={(e) => set("dueDate", e.target.value)} />
                </div>
                <div>
                  <label htmlFor={`${idp}-tags`} className="label">
                    {t("field.tags")}
                  </label>
                  <TagInput id={`${idp}-tags`} label={t("field.tags")} value={draft.tags} onChange={(v) => set("tags", v)} disabled={ro} />
                </div>
                <div>
                  <label htmlFor={`${idp}-parent`} className="label">
                    {t("field.parent")}
                  </label>
                  <input
                    id={`${idp}-parent`}
                    type="number"
                    min={1}
                    className="input"
                    placeholder="ID"
                    value={draft.parentId ?? ""}
                    disabled={ro}
                    onChange={(e) => set("parentId", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                {detail && (
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs text-ink-muted">
                    <dt>{t("field.createdBy")}</dt>
                    <dd className="text-ink">
                      {userById.get(detail.item.createdById)?.name} · {formatDateTime(detail.item.createdAt, locale)}
                    </dd>
                    <dt>{t("field.changedBy")}</dt>
                    <dd className="text-ink">
                      {userById.get(detail.item.changedById)?.name} · {formatDateTime(detail.item.changedAt, locale)}
                    </dd>
                    {detail.item.childTotal > 0 && (
                      <>
                        <dt>{t("field.children")}</dt>
                        <dd className="text-ink">{t("item.childProgress", { done: detail.item.childDone, total: detail.item.childTotal })}</dd>
                      </>
                    )}
                  </dl>
                )}
              </div>
            </div>
            {/* Discussion: right column on wide pages, below in panels/narrow windows */}
            {!isNew && detail && (
              <div className={variant === "page" ? "@5xl:border-l @5xl:border-line @5xl:pl-4" : "border-t border-line pt-4"}>
                <Discussion itemId={itemId!} comments={detail.comments} onChanged={refreshAfterSideEffect} />
              </div>
            )}
          </div>
        )}
        {tab === "history" && detail && (
          <div className="p-4">
            <History history={detail.history} type={type} />
          </div>
        )}
        {tab === "links" && detail && (
          <div className="p-4">
            <Links itemId={itemId!} links={detail.links} onChanged={refreshAfterSideEffect} onOpenItem={props.onOpenItem} />
          </div>
        )}
        {tab === "attachments" && detail && (
          <div className="p-4">
            <Attachments itemId={itemId!} attachments={detail.attachments} onChanged={refreshAfterSideEffect} />
          </div>
        )}
      </div>
    </div>
  );
}

function CustomField({
  def,
  label,
  value,
  onChange,
  readOnly,
  idp,
  itemId,
  projectId,
}: {
  def: FieldDef;
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
  idp: string;
  itemId: number | null;
  projectId: string;
}) {
  const id = `${idp}-f-${def.key}`;
  switch (def.kind) {
    case "steps":
      return (
        <div>
          <span className="label">{label}</span>
          <StepsEditor value={Array.isArray(value) ? (value as TestStep[]) : []} onChange={onChange} readOnly={readOnly} />
        </div>
      );
    case "richtext": {
      const doc = value && typeof value === "object" ? (value as RtDoc) : typeof value === "string" && value ? { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] } : null;
      return (
        <div>
          <span className="label">{label}</span>
          {readOnly ? (
            <div className="card-panel p-3">
              <RichText doc={doc} projectId={projectId} />
            </div>
          ) : (
            <RichTextEditor value={doc} onChange={onChange} workItemId={itemId ?? undefined} ariaLabel={label} minHeight={50} />
          )}
        </div>
      );
    }
    case "select":
      return (
        <div className="max-w-sm">
          <label htmlFor={id} className="label">
            {label}
          </label>
          <select id={id} className="input" value={String(value ?? "")} disabled={readOnly} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">—</option>
            {(def.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case "number":
      return (
        <div className="max-w-xs">
          <label htmlFor={id} className="label">
            {label}
          </label>
          <input id={id} type="number" className="input" value={value === null || value === undefined ? "" : String(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
        </div>
      );
    case "date":
      return (
        <div className="max-w-xs">
          <label htmlFor={id} className="label">
            {label}
          </label>
          <input id={id} type="date" className="input" value={typeof value === "string" ? value : ""} disabled={readOnly} onChange={(e) => onChange(e.target.value || null)} />
        </div>
      );
    default:
      return (
        <div>
          <label htmlFor={id} className="label">
            {label}
          </label>
          <input id={id} className="input" value={typeof value === "string" ? value : ""} disabled={readOnly} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
  }
}
