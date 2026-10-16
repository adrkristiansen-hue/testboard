"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ADDABLE_LINK_KINDS, type LinkedItem, type LinkKind } from "@/lib/detail-types";
import { addLink, removeLink, searchItems } from "@/server/actions/items";
import type { MessageKey } from "@/lib/i18n";
import { useProject } from "../ProjectProvider";
import { useT } from "../I18nProvider";
import { useSessionUser } from "../SessionProvider";
import { useToast } from "../ui/Toast";
import { TypeIcon, StateDot } from "../ui/TypeIcon";
import { Avatar } from "../ui/Avatar";

export function Links({ itemId, links, onChanged, onOpenItem }: { itemId: number; links: LinkedItem[]; onChanged: () => void; onOpenItem?: (id: number) => void }) {
  const t = useT();
  const { meta, typeById, userById } = useProject();
  const { canEdit } = useSessionUser();
  const toast = useToast();
  const [kind, setKind] = useState<LinkKind>("RELATED");
  const [target, setTarget] = useState("");
  const [results, setResults] = useState<{ id: number; title: string; typeId: string }[]>([]);
  const [pending, start] = useTransition();

  const search = (q: string) => {
    setTarget(q);
    if (q.trim().length < 1) return setResults([]);
    start(async () => setResults((await searchItems(meta.id, q)).filter((r) => r.id !== itemId)));
  };

  const add = (otherId: number) =>
    start(async () => {
      const res = await addLink(itemId, kind, otherId);
      if (!res.ok) return toast(res.error, "error");
      setTarget("");
      setResults([]);
      onChanged();
    });

  const remove = (l: LinkedItem) =>
    start(async () => {
      const res = await removeLink(itemId, l.kind, l.item.id);
      if (!res.ok) return toast(res.error, "error");
      onChanged();
    });

  const groups = ADDABLE_LINK_KINDS.map((k) => ({ kind: k, items: links.filter((l) => l.kind === k) })).filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(target.replace(/^#/, ""));
            if (Number.isInteger(n) && n > 0) add(n);
            else if (results[0]) add(results[0].id);
          }}
        >
          <div>
            <label className="label" htmlFor={`lk-${itemId}`}>
              {t("item.linkType")}
            </label>
            <select id={`lk-${itemId}`} className="input" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)}>
              {ADDABLE_LINK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`link.${k}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="relative min-w-48 flex-1">
            <label className="label" htmlFor={`lt-${itemId}`}>
              {t("item.linkTarget")}
            </label>
            <input id={`lt-${itemId}`} className="input" value={target} onChange={(e) => search(e.target.value)} placeholder="#123 / title" autoComplete="off" />
            {results.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full rounded-md border border-line-strong bg-white p-1 shadow-lg">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-brand-soft" onClick={() => add(r.id)}>
                      <TypeIcon type={typeById.get(r.typeId)} size={14} />#{r.id} {r.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" className="btn btn-secondary" disabled={pending || !target}>
            {t("item.addLink")}
          </button>
        </form>
      )}
      {groups.length === 0 && <p className="text-sm text-ink-muted">{t("item.noLinks")}</p>}
      {groups.map((g) => (
        <section key={g.kind}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(`link.${g.kind}` as MessageKey)}</h3>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-white">
            {g.items.map((l) => {
              const type = typeById.get(l.item.typeId);
              const st = type?.states.find((s) => s.name === l.item.state);
              return (
                <li key={`${l.kind}-${l.item.id}`} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <TypeIcon type={type} size={16} />
                  {onOpenItem ? (
                    <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpenItem(l.item.id)}>
                      <span className="font-semibold">#{l.item.id}</span> {l.item.title}
                    </button>
                  ) : (
                    <Link href={`/p/${meta.id}/items/${l.item.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      <span className="font-semibold">#{l.item.id}</span> {l.item.title}
                    </Link>
                  )}
                  <span className="hidden items-center gap-1 text-xs text-ink-muted sm:flex">
                    <StateDot color={st?.color ?? "#999"} />
                    {l.item.state}
                  </span>
                  <Avatar user={l.item.assignedToId ? userById.get(l.item.assignedToId) : null} size={20} />
                  {canEdit && (
                    <button type="button" className="icon-btn h-6 w-6" aria-label={`${t("common.remove")} #${l.item.id}`} onClick={() => remove(l)} disabled={pending}>
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
