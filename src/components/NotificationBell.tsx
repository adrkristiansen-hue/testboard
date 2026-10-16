"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { NotificationView } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";
import { formatRelative } from "@/lib/format";
import { getNotificationSummary, markAllNotificationsRead, markNotificationsRead } from "@/server/actions/notifications";
import { useI18n } from "./I18nProvider";
import { Popover } from "./ui/Popover";
import { Avatar } from "./ui/Avatar";

const POLL_MS = 60_000;

export function notificationHref(n: Pick<NotificationView, "projectId" | "workItemId">): string | null {
  return n.projectId && n.workItemId ? `/p/${n.projectId}/items/${n.workItemId}` : null;
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [latest, setLatest] = useState<NotificationView[] | null>(null);
  // The layout re-renders with a fresh count after router.refresh(); adopt it.
  const [serverUnread, setServerUnread] = useState(initialUnread);
  if (serverUnread !== initialUnread) {
    setServerUnread(initialUnread);
    setUnread(initialUnread);
    setLatest(null);
  }

  const refresh = useCallback(async () => {
    const res = await getNotificationSummary();
    if (res.ok) {
      setUnread(res.data.unread);
      setLatest(res.data.latest);
    }
  }, []);

  // Poll while the tab is visible, and refresh when it regains focus.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [refresh]);

  const open = async (n: NotificationView, close: () => void) => {
    close();
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setLatest((l) => l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? l);
      void markNotificationsRead([n.id]);
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  const markAll = async () => {
    setUnread(0);
    setLatest((l) => l?.map((x) => ({ ...x, read: true })) ?? l);
    await markAllNotificationsRead();
    router.refresh();
  };

  return (
    <Popover
      label={t("notif.bellLabel", { count: unread })}
      align="right"
      triggerClassName="relative grid h-8 w-8 place-items-center rounded text-white/85 hover:bg-white/10 hover:text-white"
      trigger={
        // Clicks bubble from here to the Popover's button: refresh the list every time it opens.
        <span onClick={() => void refresh()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unread > 0 && (
            <span data-testid="unread-badge" className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
      }
    >
      {(close) => {
        return (
          <div className="w-[min(380px,90vw)] text-ink">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="font-semibold">{t("notif.title")}</span>
              {unread > 0 && (
                <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={markAll}>
                  {t("notif.markAllRead")}
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              {latest === null && <li className="px-2 py-3 text-sm text-ink-muted">{t("common.loading")}</li>}
              {latest?.length === 0 && <li className="px-2 py-3 text-sm text-ink-muted">{t("notif.empty")}</li>}
              {latest?.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n, close)} className={`flex w-full gap-2 rounded px-2 py-2 text-left text-sm hover:bg-brand-soft ${n.read ? "" : "bg-brand-soft/50"}`}>
                    <Avatar user={n.actor} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className={`block ${n.read ? "" : "font-semibold"}`}>{n.message}</span>
                      <span className="text-xs text-ink-muted">
                        {t(`notif.type.${n.type}` as MessageKey)} · {formatRelative(n.createdAt, locale)}
                      </span>
                    </span>
                    {!n.read && <span aria-label={t("notif.filterUnread")} className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-2 py-1.5 text-center">
              <Link href="/notifications" onClick={close} className="text-sm font-semibold text-brand hover:underline">
                {t("notif.seeAll")}
              </Link>
            </div>
          </div>
        );
      }}
    </Popover>
  );
}
