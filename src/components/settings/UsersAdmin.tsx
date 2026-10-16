"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ROLES, type Role } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";
import { saveUser } from "@/server/actions/config";
import { useT } from "../I18nProvider";
import { useToast } from "../ui/Toast";
import { Avatar } from "../ui/Avatar";

interface Row {
  id?: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  active: boolean;
  password?: string;
}

export function UsersAdmin({ users }: { users: Row[]; currentUserId: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<Row | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    editing &&
    start(async () => {
      const res = await saveUser({ ...editing, password: editing.password ?? "" });
      if (!res.ok) return toast(res.error, "error");
      toast(t("common.saved"), "success");
      setEditing(null);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold">{t("admin.users")}</h1>
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing({ name: "", email: "", role: "MEMBER", color: "#2563eb", active: true, password: "" })}>
          + {t("admin.addUser")}
        </button>
      </div>
      <div className="card-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="p-2">{t("common.name")}</th>
              <th className="p-2">{t("login.email")}</th>
              <th className="p-2">{t("admin.role")}</th>
              <th className="p-2">{t("admin.active")}</th>
              <th className="p-2">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-b border-line ${u.active ? "" : "text-ink-muted"}`}>
                <td className="p-2">
                  <span className="flex items-center gap-2">
                    <Avatar user={u} size={24} />
                    {u.name}
                  </span>
                </td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">{t(`role.${u.role}` as MessageKey)}</td>
                <td className="p-2">{u.active ? t("common.yes") : t("common.no")}</td>
                <td className="p-2 text-right">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...u, password: "" })}>
                    {t("common.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <form
          className="card-panel grid gap-3 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 className="font-semibold sm:col-span-2">{editing.id ? editing.name : t("admin.addUser")}</h2>
          <div>
            <label className="label" htmlFor="u-name">
              {t("common.name")}
            </label>
            <input id="u-name" required className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="u-email">
              {t("login.email")}
            </label>
            <input id="u-email" type="email" required className="input" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="u-role">
              {t("admin.role")}
            </label>
            <select id="u-role" className="input" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-pass">
              {editing.id ? t("admin.resetPassword") : t("admin.password")}
            </label>
            <input id="u-pass" type="password" autoComplete="new-password" minLength={editing.id ? undefined : 8} required={!editing.id} className="input" value={editing.password ?? ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
          </div>
          <div className="flex items-end gap-4">
            <div>
              <label className="label" htmlFor="u-color">
                {t("settings.color")}
              </label>
              <input id="u-color" type="color" className="h-8 w-12 rounded border border-line-strong" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 pb-1.5 text-sm">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              {t("admin.active")}
            </label>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {t("common.save")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
