"use client";

import { logout } from "@/server/actions/auth";
import type { UserLite } from "@/lib/types";
import { Avatar } from "./ui/Avatar";
import { Popover } from "./ui/Popover";
import { useT } from "./I18nProvider";
import type { MessageKey } from "@/lib/i18n";

export function UserMenu({ user }: { user: UserLite }) {
  const t = useT();
  return (
    <Popover label={user.name} trigger={<Avatar user={user} size={28} />} align="right" triggerClassName="rounded-full">
      {() => (
        <div className="w-60 p-1 text-ink">
          <div className="px-2 py-2">
            <div className="font-semibold">{user.name}</div>
            <div className="text-xs text-ink-muted">{user.email}</div>
            <div className="mt-1 text-xs">{t(`role.${user.role}` as MessageKey)}</div>
          </div>
          <form action={logout}>
            <button type="submit" className="w-full rounded px-2 py-1.5 text-left hover:bg-brand-soft">
              {t("nav.signOut")}
            </button>
          </form>
        </div>
      )}
    </Popover>
  );
}
