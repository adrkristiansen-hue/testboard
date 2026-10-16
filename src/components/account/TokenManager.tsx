"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TokenView } from "@/server/tokens-view";
import { createApiToken, revokeApiToken } from "@/server/actions/tokens";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "../I18nProvider";
import { useToast } from "../ui/Toast";

export function TokenManager({ tokens, showOwner, canCreate }: { tokens: TokenView[]; showOwner: boolean; canCreate: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createApiToken(name);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setCreated(res.data.token);
    setName("");
    router.refresh();
  };
  const revoke = async (tk: TokenView) => {
    if (!confirm(t("tokens.confirmRevoke", { name: tk.name }))) return;
    const res = await revokeApiToken(tk.id);
    if (!res.ok) return toast(res.error, "error");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        {t("tokens.intro")}{" "}
        <Link href="/api/docs" className="font-semibold text-brand hover:underline">
          {t("tokens.docs")}
        </Link>
      </p>
      {canCreate && (
        <form onSubmit={create} className="card-panel flex flex-wrap items-end gap-2 p-3">
          <div className="min-w-60 flex-1">
            <label htmlFor="tk-name" className="label">
              {t("tokens.name")}
            </label>
            <input id="tk-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tokens.namePlaceholder")} maxLength={80} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {t("tokens.create")}
          </button>
        </form>
      )}
      {created && (
        <div role="alert" className="card-panel border-l-4 border-l-[#0ca30c] p-3">
          <p className="mb-1 text-sm font-semibold">{t("tokens.copyNow")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-gray-100 px-2 py-1 text-sm" data-testid="new-token">
              {created}
            </code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void navigator.clipboard?.writeText(created).then(() => toast(t("tokens.copied"), "success"))}>
              {t("tokens.copy")}
            </button>
          </div>
        </div>
      )}
      <div className="card-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th scope="col" className="px-3 py-2 font-semibold">{t("tokens.name")}</th>
              {showOwner && <th scope="col" className="px-3 py-2 font-semibold">{t("query.owner")}</th>}
              <th scope="col" className="px-3 py-2 font-semibold">{t("tokens.prefix")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("field.createdAt")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("tokens.lastUsed")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((tk) => (
              <tr key={tk.id} className={`border-t border-line ${tk.revoked ? "text-ink-muted line-through" : ""}`}>
                <td className="px-3 py-1.5">{tk.name}</td>
                {showOwner && <td className="px-3 py-1.5">{tk.owner}</td>}
                <td className="px-3 py-1.5 font-mono text-xs">{tk.prefix}…</td>
                <td className="px-3 py-1.5">{formatDateTime(tk.createdAt, locale)}</td>
                <td className="px-3 py-1.5">{tk.lastUsedAt ? formatDateTime(tk.lastUsedAt, locale) : t("tokens.never")}</td>
                <td className="px-3 py-1.5 text-right">
                  {tk.revoked ? (
                    <span className="no-underline">{t("tokens.revoked")}</span>
                  ) : (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => revoke(tk)}>
                      {t("tokens.revoke")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tokens.length === 0 && <p className="p-6 text-center text-ink-muted">{t("tokens.empty")}</p>}
      </div>
    </div>
  );
}
