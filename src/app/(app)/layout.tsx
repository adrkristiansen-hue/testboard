import Link from "next/link";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { LanguageToggle } from "@/components/LanguageToggle";
import { UserMenu } from "@/components/UserMenu";
import { SessionProvider } from "@/components/SessionProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await getT();
  return (
    <SessionProvider user={user}>
      <div className="flex min-h-full flex-col">
        <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[200] rounded bg-white px-3 py-2 font-semibold text-brand shadow">
          {t("nav.skipToContent")}
        </a>
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-3 bg-[#1b2433] px-3 text-white">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded bg-brand text-sm">
              TB
            </span>
            <span className="hidden sm:inline">{t("app.name")}</span>
          </Link>
          <nav aria-label="Global" className="flex items-center gap-1 text-sm">
            <Link href="/projects" className="rounded px-2 py-1 text-white/85 hover:bg-white/10 hover:text-white">
              {t("nav.projects")}
            </Link>
            {user.role === "ADMIN" && (
              <Link href="/admin/users" className="rounded px-2 py-1 text-white/85 hover:bg-white/10 hover:text-white">
                {t("nav.admin")}
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle dark />
            <UserMenu user={user} />
          </div>
        </header>
        <div id="main" className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </SessionProvider>
  );
}
