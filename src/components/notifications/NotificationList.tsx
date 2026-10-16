"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NotificationView } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";
import { formatDateTime, formatRelative } from "@/lib/format";
import { markAllNotificationsRead, markNotificationsRead } from "@/server/actions/notifications";
import { useI18n } from "../I18nProvider";
import { Avatar } from "../ui/Avatar";
import { notificationHref } from "../NotificationBell";

export function NotificationList({ initial, unreadOnly }: { initial: NotificationView[]; unreadOnly: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const unread = items.filter((n) => !n.read).length;

  const setRead = async (n: NotificationView, read: boolean) => {
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read } : x)));
    await markNotificationsRead([n.id], read);
    router.refresh();
  };
  const markAll = async () => {
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    await markAllNotificationsRead();
    router.refresh();
  };

  const tab = (active: boolean) => `rounded px-3 py-1 text-sm ${active ? "bg-brand-soft font-semibold text-brand-dark" : "hover:bg-gray-100"}`;

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">{t("notif.title")}</h1>
        <nav aria-label={t("notif.title")} className="flex gap-1">
          <Link href="/notifications" aria-current={!unreadOnly ? "page" : undefined} className={tab(!unreadOnly)}>
            {t("notif.filterAll")}
          </Link>
          <Link href="/notifications?filter=unread" aria-current={unreadOnly ? "page" : undefined} className={tab(unreadOnly)}>
            {t("notif.filterUnread")}
          </Link>
        </nav>
        <button type="button" className="btn btn-secondary btn-sm" disabled={unread === 0} onClick={markAll}>
          {t("notif.markAllRead")}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="card-panel p-6 text-center text-ink-muted">{t("notif.empty")}</p>
      ) : (
        <ul className="card-panel divide-y divide-line">
          {items.map((n) => {
            const href = notificationHref(n);
            return (
              <li key={n.id} className={`flex items-start gap-3 px-3 py-2.5 ${n.read ? "" : "bg-brand-soft/40"}`}>
                <Avatar user={n.actor} size={28} />
                <div className="min-w-0 flex-1">
                  {href ? (
                    <Link href={href} onClick={() => !n.read && void markNotificationsRead([n.id])} className={`hover:underline ${n.read ? "" : "font-semibold"}`}>
                      {n.message}
                    </Link>
                  ) : (
                    <span>{n.message}</span>
                  )}
                  <div className="text-xs text-ink-muted">
                    <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5">{t(`notif.type.${n.type}` as MessageKey)}</span>
                    <time dateTime={n.createdAt} title={formatDateTime(n.createdAt, locale)}>
                      {formatRelative(n.createdAt, locale)}
                    </time>
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setRead(n, !n.read)}>
                  {n.read ? t("notif.markUnread") : t("notif.markRead")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
