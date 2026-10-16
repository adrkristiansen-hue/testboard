"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectNav({ projectName, projectKey, links }: { projectName: string; projectKey: string; links: { href: string; label: string; icon: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={projectName} className="shrink-0 border-b border-line bg-white md:w-52 md:border-b-0 md:border-r">
      <div className="hidden px-4 pb-2 pt-4 md:block">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{projectKey}</div>
        <div className="font-semibold leading-tight">{projectName}</div>
      </div>
      <ul className="flex gap-1 overflow-x-auto px-2 py-1 md:flex-col md:py-2">
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded px-3 py-1.5 text-sm ${active ? "bg-brand-soft font-semibold text-brand-dark" : "text-ink hover:bg-gray-100"}`}
              >
                <span aria-hidden="true" className="w-4 text-center">
                  {l.icon}
                </span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
