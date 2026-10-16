import type { Locale } from "./i18n";

const tag = (l: Locale) => (l === "nb" ? "nb-NO" : "en-GB");

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(tag(locale), { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(tag(locale), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(iso: string, locale: Locale, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(iso, locale);
}

/** yyyy-mm-dd for <input type="date"> */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
