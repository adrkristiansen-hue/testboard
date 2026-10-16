import "server-only";
import { cookies } from "next/headers";
import { getDictionary, isLocale, LOCALE_COOKIE, makeT, type Locale } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : "en";
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(getDictionary(locale)) };
}
