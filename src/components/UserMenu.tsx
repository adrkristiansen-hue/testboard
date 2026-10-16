"use client";

import Link from "next/link";
import { useState } from "react";
import { logout } from "@/server/actions/auth";
import { setEmailNotifications } from "@/server/actions/notifications";
import type { UserLite } from "@/lib/types";
import { Avatar } from "./ui/Avatar";
import { Popover } from "./ui/Popover";
import { useT } from "./I18nProvider";
import type { MessageKey } from "@/lib/i18n";

export function UserMenu({ user, emailNotifications, emailServerEnabled }: { user: UserLite; emailNotifications: boolean; emailServerEnabled: boolean }) {
  const t = useT();
  const [email, setEmail] = useState(emailNotifications);
  const toggleEmail = async (v: boolean) => {
    setEmail(v);
    const res = await setEmailNotifications(v);
    if (!res.ok) setEmail(!v);
  };
  return (
    <Popover label={user.name} trigger={<Avatar user={user} size={28} />} align="right" triggerClassName="rounded-full">
      {() => (
        <div className="w-64 p-1 text-ink">
          <div className="px-2 py-2">
            <div className="font-semibold">{user.name}</div>
            <div className="text-xs text-ink-muted">{user.email}</div>
            <div className="mt-1 text-xs">{t(`role.${user.role}` as MessageKey)}</div>
          </div>
          <div className="border-t border-line px-2 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={email} onChange={(e) => toggleEmail(e.target.checked)} />
              {t("notif.emailPref")}
            </label>
            {!emailServerEnabled && <p className="mt-1 text-xs text-ink-muted">{t("notif.emailServerOff")}</p>}
          </div>
          <Link href="/account/tokens" className="block border-t border-line px-2 py-1.5 text-sm hover:bg-brand-soft">
            {t("nav.apiTokens")}
          </Link>
          <form action={logout} className="border-t border-line pt-1">
            <button type="submit" className="w-full rounded px-2 py-1.5 text-left hover:bg-brand-soft">
              {t("nav.signOut")}
            </button>
          </form>
        </div>
      )}
    </Popover>
  );
}
