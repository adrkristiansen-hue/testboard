"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getDictionary, makeT, type Locale, type TFunction } from "@/lib/i18n";

const I18nContext = createContext<{ locale: Locale; t: TFunction } | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(getDictionary(locale)) }), [locale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}
