"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/server/actions/auth";
import { useI18n } from "./I18nProvider";

export function LanguageToggle({ dark = false }: { dark?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (l: "en" | "nb") =>
    start(async () => {
      await setLocale(l);
      router.refresh();
    });
  return (
    <div role="group" aria-label={t("nav.language")} className={`inline-flex overflow-hidden rounded border text-xs font-semibold ${dark ? "border-white/30" : "border-line-strong"}`}>
      {(["en", "nb"] as const).map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          aria-pressed={locale === l}
          onClick={() => choose(l)}
          className={`px-2 py-1 ${locale === l ? (dark ? "bg-white text-gray-900" : "bg-brand text-white") : dark ? "text-white/80 hover:bg-white/10" : "bg-white hover:bg-gray-100"}`}
        >
          {l === "en" ? "EN" : "NO"}
        </button>
      ))}
    </div>
  );
}
