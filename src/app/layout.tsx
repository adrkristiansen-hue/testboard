import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/server/locale";
import { I18nProvider } from "@/components/I18nProvider";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: { default: "TestBoard", template: "%s · TestBoard" },
  description: "Lightweight test tracking board for HR system implementations",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale === "nb" ? "nb" : "en"}>
      <body className="antialiased">
        <I18nProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
