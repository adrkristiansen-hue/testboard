"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteOrganization, saveOrganization } from "@/server/actions/config";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";

type Org = { id: string; name: string; internal: boolean; userCount: number };

export function OrganizationsAdmin({ orgs }: { orgs: Org[] }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [internal, setInternal] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error ?? t("common.error"), "error");
      toast(t("common.saved"), "success");
      after?.();
      router.refresh();
    });
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">{t("nav.organizations")}</h1>
      <p className="text-sm text-ink-muted">{t("org.hint")}</p>
      <ul className="card-panel divide-y divide-line">
        {orgs.map((o) => (
          <OrgRow key={o.id} org={o} pending={pending} run={run} />
        ))}
        {orgs.length === 0 && <li className="p-4 text-sm text-ink-muted">{t("org.empty")}</li>}
      </ul>
      <form
        className="card-panel flex flex-wrap items-end gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveOrganization({ name, internal }), () => {
            setName("");
            setInternal(false);
          });
        }}
      >
        <div className="min-w-60 flex-1">
          <label className="label" htmlFor="org-new">
            {t("access.newOrganization")}
          </label>
          <input id="org-new" className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          {t("org.internal")}
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
          {t("common.add")}
        </button>
      </form>
    </div>
  );
}

function OrgRow({ org, pending, run }: { org: Org; pending: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  const t = useT();
  const [name, setName] = useState(org.name);
  const [internal, setInternal] = useState(org.internal);
  const dirty = name !== org.name || internal !== org.internal;
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <input aria-label={t("common.name")} className="input max-w-xs" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
        {t("org.internal")}
      </label>
      <span className="text-xs text-ink-muted">{t("org.people", { count: org.userCount })}</span>
      <div className="ml-auto flex gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending || !dirty || !name.trim()} onClick={() => run(() => saveOrganization({ id: org.id, name, internal }))}>
          {t("common.save")}
        </button>
        {org.userCount === 0 && (
          <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => confirm(t("common.confirmDelete")) && run(() => deleteOrganization(org.id))}>
            {t("common.delete")}
          </button>
        )}
      </div>
    </li>
  );
}
