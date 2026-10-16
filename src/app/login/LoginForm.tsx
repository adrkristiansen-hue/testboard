"use client";

import { useActionState } from "react";
import { login } from "@/server/actions/auth";
import { useT } from "@/components/I18nProvider";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { MessageKey } from "@/lib/i18n";

export function LoginForm({ next }: { next: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-2xl font-bold text-brand">{t("app.name")}</div>
        <p className="text-ink-muted">{t("app.tagline")}</p>
      </div>
      <form action={action} className="card-panel space-y-4 p-6">
        <h1 className="text-lg font-semibold">{t("login.title")}</h1>
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="label">
            {t("login.email")}
          </label>
          <input id="email" name="email" type="email" autoComplete="username" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">
            {t("login.password")}
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {t(state.error as MessageKey)}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
          {t("login.submit")}
        </button>
        <p className="text-xs text-ink-muted">{t("login.demoHint")}</p>
      </form>
      <div className="mt-4 flex justify-center">
        <LanguageToggle />
      </div>
    </div>
  );
}
