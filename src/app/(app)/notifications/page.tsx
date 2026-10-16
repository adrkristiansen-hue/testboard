import { requireUser } from "@/server/auth";
import { loadNotifications } from "@/server/notifications";
import { NotificationList } from "@/components/notifications/NotificationList";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";
  const items = await loadNotifications(user.id, { unreadOnly, take: 200 });
  return <NotificationList key={filter ?? "all"} initial={items} unreadOnly={unreadOnly} />;
}
