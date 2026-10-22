"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { AccessData } from "@/server/access-admin";
import type { ActionResult } from "@/server/result";
import { deleteRole, inviteMember, newInviteLink, removeMember, saveRole, setBoardAccess, setMemberRole } from "@/server/actions/access";
import { PERMISSION_GROUPS, roleLabel, type Permission } from "@/lib/permissions";
import type { MessageKey } from "@/lib/i18n";
import { useProject } from "../ProjectProvider";
import { useSessionUser } from "../SessionProvider";
import { useI18n, useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";

function useRun() {
  const toast = useToast();
  const router = useRouter();
  const t = useT();
  const [pending, start] = useTransition();
  const exec = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (d: T) => void, quiet = false) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error, "error");
      if (!quiet) toast(t("common.saved"), "success");
      onOk?.(res.data);
      router.refresh();
    });
  return { pending, exec };
}

function CopyLink({ path }: { path: string }) {
  const t = useT();
  const toast = useToast();
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded bg-gray-100 px-2 py-1 text-xs" data-testid="invite-link">
        {url}
      </code>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void navigator.clipboard?.writeText(url).then(() => toast(t("tokens.copied"), "success"))}>
        {t("tokens.copy")}
      </button>
    </div>
  );
}

export function AccessSettings({ data }: { data: AccessData }) {
  return (
    <div className="flex flex-col gap-6">
      <Members data={data} />
      <BoardLocks data={data} />
      <Roles data={data} />
    </div>
  );
}

function Members({ data }: { data: AccessData }) {
  const { t, locale } = useI18n();
  const { meta } = useProject();
  const { user } = useSessionUser();
  const { pending, exec } = useRun();
  const defaultRole = data.roles.find((r) => !r.permissions.includes("access.manage") && r.permissions.includes("items.create"))?.id ?? data.roles[0]?.id ?? "";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(defaultRole);
  const [org, setOrg] = useState<string>("");
  const [newOrg, setNewOrg] = useState("");
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [link, setLink] = useState<{ path: string; email: string; emailed: boolean } | null>(null);
  const [filter, setFilter] = useState("");
  const existing = useMemo(() => data.members.find((m) => m.email.toLowerCase() === email.trim().toLowerCase()), [data.members, email]);
  const shown = data.members.filter((m) => !filter || `${m.name} ${m.email} ${m.organization ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    exec(
      () => inviteMember({ projectId: meta.id, email: target, name: name.trim() || undefined, roleId, organizationId: org && org !== "__new" ? org : null, newOrganization: org === "__new" ? newOrg.trim() : undefined, boardIds }),
      (d) => {
        setLink(d.invitePath ? { path: d.invitePath, email: target, emailed: d.emailed } : null);
        setEmail("");
        setName("");
        setBoardIds([]);
      },
    );
  };

  return (
    <section aria-labelledby="acc-members" className="card-panel p-4">
      <h2 id="acc-members" className="font-semibold">
        {t("access.members")} <span className="font-normal text-ink-muted">({data.members.length})</span>
      </h2>
      <p className="mb-3 text-sm text-ink-muted">{t("access.membersHint")}</p>

      <form onSubmit={invite} className="mb-4 grid gap-2 rounded border border-line bg-gray-50 p-3 md:grid-cols-2">
        <h3 className="text-sm font-semibold md:col-span-2">{t("access.addPerson")}</h3>
        <div>
          <label className="label" htmlFor="inv-email">
            {t("login.email")}
          </label>
          <input id="inv-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="navn@firma.no" />
          {existing && <p className="mt-1 text-xs text-ink-muted">{t("access.alreadyMember", { name: existing.name })}</p>}
        </div>
        <div>
          <label className="label" htmlFor="inv-name">
            {t("common.name")} <span className="font-normal text-ink-muted">({t("access.nameIfNew")})</span>
          </label>
          <input id="inv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="inv-role">
            {t("access.role")}
          </label>
          <select id="inv-role" className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {data.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r.name, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="inv-org">
            {t("access.organization")}
          </label>
          <div className="flex gap-2">
            <select id="inv-org" className="input" value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">{t("access.noOrganization")}</option>
              {data.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.internal ? ` (${t("access.internal")})` : ""}
                </option>
              ))}
              <option value="__new">+ {t("access.newOrganization")}</option>
            </select>
            {org === "__new" && <input aria-label={t("access.newOrganization")} className="input" value={newOrg} onChange={(e) => setNewOrg(e.target.value)} required maxLength={120} placeholder="Kunde AS" />}
          </div>
        </div>
        {data.boards.length > 0 && (
          <fieldset className="md:col-span-2">
            <legend className="label">{t("access.boardsOptional")}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {data.boards.map((b) => (
                <label key={b.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={boardIds.includes(b.id)} onChange={() => setBoardIds((l) => (l.includes(b.id) ? l.filter((x) => x !== b.id) : [...l, b.id]))} />
                  {b.restricted ? "🔒 " : ""}
                  {b.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="md:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={pending || !email.trim()}>
            {existing ? t("access.updatePerson") : t("access.invite")}
          </button>
        </div>
      </form>

      {link && (
        <div role="status" className="mb-4 rounded border-l-4 border-l-[#0ca30c] bg-white p-3">
          <p className="mb-1 text-sm font-semibold">{link.emailed ? t("access.inviteEmailed", { email: link.email }) : t("access.inviteCopy", { email: link.email })}</p>
          <CopyLink path={link.path} />
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <input type="search" aria-label={t("access.searchMembers")} placeholder={t("access.searchMembers")} className="input max-w-xs py-1" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th scope="col" className="py-1.5 pr-2 font-semibold">{t("common.name")}</th>
              <th scope="col" className="py-1.5 pr-2 font-semibold">{t("access.organization")}</th>
              <th scope="col" className="py-1.5 pr-2 font-semibold">{t("access.role")}</th>
              <th scope="col" className="py-1.5 pr-2 font-semibold">{t("access.status")}</th>
              <th scope="col" className="py-1.5 font-semibold">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <MemberRow key={m.userId} m={m} roles={data.roles} self={m.userId === user.id} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MemberRow({ m, roles, self }: { m: AccessData["members"][number]; roles: AccessData["roles"]; self: boolean }) {
  const { t, locale } = useI18n();
  const { meta } = useProject();
  const { pending, exec } = useRun();
  const [link, setLink] = useState<string | null>(null);
  return (
    <>
      <tr className="border-t border-line align-top">
        <td className="py-1.5 pr-2">
          <div className="font-medium">
            {m.name}
            {self && <span className="ml-1 text-xs text-ink-muted">({t("access.you")})</span>}
          </div>
          <div className="text-xs text-ink-muted">{m.email}</div>
        </td>
        <td className="py-1.5 pr-2">
          {m.organization ?? <span className="text-ink-muted">–</span>}
          {m.internal && <span className="ml-1 rounded bg-brand-soft px-1 text-xs text-brand-dark">{t("access.internal")}</span>}
        </td>
        <td className="py-1.5 pr-2">
          <select aria-label={t("access.roleFor", { name: m.name })} className="input py-1" value={m.roleId} disabled={pending} onChange={(e) => exec(() => setMemberRole(meta.id, m.userId, e.target.value))}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r.name, locale)}
              </option>
            ))}
          </select>
        </td>
        <td className="py-1.5 pr-2 text-xs">
          {!m.active ? (
            <span className="text-danger">{t("access.deactivated")}</span>
          ) : m.pendingInvite ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[#5c3a00]">{t("access.pending")}</span>
          ) : m.authProvider === "MICROSOFT" ? (
            <span>{t("access.microsoft")}</span>
          ) : (
            <span className="text-ink-muted">{t("access.active")}</span>
          )}
        </td>
        <td className="whitespace-nowrap py-1.5 text-right">
          {m.authProvider !== "MICROSOFT" && !self && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => exec(() => newInviteLink(meta.id, m.userId), (d) => setLink(d.invitePath), true)}>
              {m.pendingInvite ? t("access.newLink") : t("access.resetLink")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={pending}
            aria-label={`${t("access.remove")}: ${m.name}`}
            onClick={() => confirm(t("access.confirmRemove", { name: m.name })) && exec(() => removeMember(meta.id, m.userId))}
          >
            {t("access.remove")}
          </button>
        </td>
      </tr>
      {link && (
        <tr>
          <td colSpan={5} className="pb-2">
            <CopyLink path={link} />
          </td>
        </tr>
      )}
    </>
  );
}

function BoardLocks({ data }: { data: AccessData }) {
  const t = useT();
  const { meta } = useProject();
  const { pending, exec } = useRun();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ restricted: boolean; memberIds: string[] }>({ restricted: false, memberIds: [] });
  return (
    <section aria-labelledby="acc-boards" className="card-panel p-4">
      <h2 id="acc-boards" className="font-semibold">
        {t("access.boardLocks")}
      </h2>
      <p className="mb-3 text-sm text-ink-muted">{t("access.boardLocksHint")}</p>
      <ul className="divide-y divide-line">
        {data.boards.map((b) => (
          <li key={b.id} className="py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {b.restricted ? "🔒 " : ""}
                {b.name}
              </span>
              <span className="text-xs text-ink-muted">{b.restricted ? t("access.lockedFor", { count: b.memberIds.length }) : t("access.openForAll")}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm ml-auto"
                aria-expanded={open === b.id}
                onClick={() => {
                  setOpen(open === b.id ? null : b.id);
                  setDraft({ restricted: b.restricted, memberIds: b.memberIds });
                }}
              >
                {t("common.edit")}
              </button>
            </div>
            {open === b.id && (
              <div className="mt-2 rounded border border-line bg-gray-50 p-3">
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={draft.restricted} onChange={(e) => setDraft((d) => ({ ...d, restricted: e.target.checked }))} />
                  {t("access.lockBoard")}
                </label>
                <fieldset>
                  <legend className="label">{t("access.boardMembers")}</legend>
                  <div className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {data.members.map((m) => (
                      <label key={m.userId} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={draft.memberIds.includes(m.userId)}
                          onChange={() => setDraft((d) => ({ ...d, memberIds: d.memberIds.includes(m.userId) ? d.memberIds.filter((x) => x !== m.userId) : [...d.memberIds, m.userId] }))}
                        />
                        {m.name}
                        {m.organization && <span className="text-xs text-ink-muted">· {m.organization}</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => exec(() => setBoardAccess(meta.id, b.id, draft), () => setOpen(null))}>
                    {t("common.save")}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(null)}>
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Roles({ data }: { data: AccessData }) {
  const { t, locale } = useI18n();
  const { meta } = useProject();
  const { pending, exec } = useRun();
  const [drafts, setDrafts] = useState<Record<string, { name: string; permissions: Permission[] }>>(() => Object.fromEntries(data.roles.map((r) => [r.id, { name: r.name, permissions: r.permissions }])));
  const [serverRoles, setServerRoles] = useState(data.roles);
  // Pick up roles added or changed on the server.
  if (serverRoles !== data.roles) {
    setServerRoles(data.roles);
    setDrafts(Object.fromEntries(data.roles.map((r) => [r.id, { name: r.name, permissions: r.permissions }])));
  }
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState(data.roles[0]?.id ?? "");
  const dirty = (id: string) => {
    const r = data.roles.find((x) => x.id === id)!;
    const d = drafts[id];
    return !!d && (d.name !== r.name || [...d.permissions].sort().join() !== [...r.permissions].sort().join());
  };
  const toggle = (id: string, p: Permission) =>
    setDrafts((all) => {
      const d = all[id];
      const has = d.permissions.includes(p);
      return { ...all, [id]: { ...d, permissions: has ? d.permissions.filter((x) => x !== p) : [...d.permissions, p] } };
    });

  return (
    <section aria-labelledby="acc-roles" className="card-panel p-4">
      <h2 id="acc-roles" className="font-semibold">
        {t("access.roles")}
      </h2>
      <p className="mb-3 text-sm text-ink-muted">{t("access.rolesHint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-72 py-1.5 pr-2 text-left text-xs font-semibold text-ink-muted">
                {t("access.permission")}
              </th>
              {data.roles.map((r) => (
                <th key={r.id} scope="col" className="px-2 py-1.5 align-bottom text-xs font-semibold">
                  <input
                    aria-label={t("access.roleName")}
                    className="input w-32 py-0.5 text-center text-xs font-semibold"
                    value={drafts[r.id]?.name ?? r.name}
                    onChange={(e) => setDrafts((all) => ({ ...all, [r.id]: { ...all[r.id], name: e.target.value } }))}
                  />
                  <div className="mt-0.5 font-normal text-ink-muted">{t("access.memberCount", { count: r.memberCount })}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <PermissionGroup key={g.key} group={g} roles={data.roles} drafts={drafts} onToggle={toggle} />
            ))}
            <tr className="border-t border-line">
              <td />
              {data.roles.map((r) => (
                <td key={r.id} className="px-2 py-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <button type="button" className="btn btn-primary btn-sm" disabled={pending || !dirty(r.id)} onClick={() => exec(() => saveRole({ projectId: meta.id, id: r.id, ...drafts[r.id] }))}>
                      {t("common.save")}
                    </button>
                    {r.memberCount === 0 && (
                      <button type="button" className="text-xs text-danger hover:underline" onClick={() => confirm(t("common.confirmDelete")) && exec(() => deleteRole(meta.id, r.id))}>
                        {t("common.delete")}
                      </button>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <form
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const src = data.roles.find((r) => r.id === copyFrom);
          exec(() => saveRole({ projectId: meta.id, name: newName.trim(), permissions: src?.permissions ?? ["items.view"] }), () => setNewName(""));
        }}
      >
        <div>
          <label className="label" htmlFor="role-new">
            {t("access.newRole")}
          </label>
          <input id="role-new" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} required placeholder={t("access.newRolePlaceholder")} />
        </div>
        <div>
          <label className="label" htmlFor="role-copy">
            {t("access.copyFrom")}
          </label>
          <select id="role-copy" className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            {data.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r.name, locale)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary" disabled={pending || !newName.trim()}>
          {t("access.createRole")}
        </button>
      </form>
    </section>
  );
}

function PermissionGroup({
  group,
  roles,
  drafts,
  onToggle,
}: {
  group: (typeof PERMISSION_GROUPS)[number];
  roles: AccessData["roles"];
  drafts: Record<string, { name: string; permissions: Permission[] }>;
  onToggle: (roleId: string, p: Permission) => void;
}) {
  const t = useT();
  return (
    <>
      <tr>
        <th colSpan={roles.length + 1} scope="colgroup" className="bg-gray-50 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {t(`perm.group.${group.key}` as MessageKey)}
        </th>
      </tr>
      {group.permissions.map((p) => (
        <tr key={p} className="border-t border-line">
          <th scope="row" className="py-1.5 pr-2 text-left font-normal">
            <div>{t(`perm.${p}` as MessageKey)}</div>
            <div className="text-xs text-ink-muted">{t(`perm.${p}.hint` as MessageKey)}</div>
          </th>
          {roles.map((r) => (
            <td key={r.id} className="px-2 py-1.5 text-center">
              <input
                type="checkbox"
                aria-label={`${drafts[r.id]?.name ?? r.name}: ${t(`perm.${p}` as MessageKey)}`}
                checked={p === "items.view" || (drafts[r.id]?.permissions.includes(p) ?? false)}
                disabled={p === "items.view"}
                onChange={() => onToggle(r.id, p)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
