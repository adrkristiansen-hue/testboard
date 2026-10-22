"use client";

import Link from "next/link";
import { useT } from "../I18nProvider";
import type { MessageKey } from "@/lib/i18n";

const LINKS: { key: string; href: string; label: MessageKey }[] = [
  { key: "users", href: "/admin/users", label: "nav.users" },
  { key: "organizations", href: "/admin/organizations", label: "nav.organizations" },
  { key: "audit", href: "/admin/audit", label: "nav.audit" },
  { key: "tokens", href: "/admin/tokens", label: "nav.apiTokens" },
  { key: "templates", href: "/admin/templates", label: "nav.templates" },
];

export function AdminNav({ current }: { current: string }) {
  const t = useT();
  return (
    <nav aria-label={t("nav.admin")} className="mb-4 flex gap-1 border-b border-line">
      {LINKS.map((l) => (
        <Link key={l.key} href={l.href} aria-current={current === l.key ? "page" : undefined} className={`border-b-2 px-3 py-1.5 text-sm ${current === l.key ? "border-brand font-semibold" : "border-transparent text-ink-muted hover:text-ink"}`}>
          {t(l.label)}
        </Link>
      ))}
    </nav>
  );
}
