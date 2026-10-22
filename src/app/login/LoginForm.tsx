"use client";

import { useActionState } from "react";
import { login } from "@/server/actions/auth";
import { useT } from "@/components/I18nProvider";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { MessageKey } from "@/lib/i18n";

export function LoginForm({ next, microsoft, ssoError }: { next: string; microsoft: boolean; ssoError?: string }) {
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
        {ssoError && (
          <p role="alert" className="rounded bg-red-50 p-2 text-sm text-danger">
            {t(`login.${ssoError}` as MessageKey)}
          </p>
        )}
        {microsoft && (
          <>
            <a href={`/auth/microsoft/start?next=${encodeURIComponent(next)}`} className="btn btn-secondary w-full justify-center gap-2">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              {t("login.microsoft")}
            </a>
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="h-px flex-1 bg-line" />
              {t("login.orPassword")}
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}
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
