"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/server/actions/auth";
import { useT } from "@/components/I18nProvider";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { MessageKey } from "@/lib/i18n";

export function AcceptInviteForm({ token, name, email }: { token: string; name: string; email: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-2xl font-bold text-brand">{t("app.name")}</div>
        <p className="text-ink-muted">{t("app.tagline")}</p>
      </div>
      <form action={action} className="card-panel space-y-4 p-6">
        <h1 className="text-lg font-semibold">{t("invite.title", { name })}</h1>
        <p className="text-sm text-ink-muted">{t("invite.intro", { email })}</p>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} autoComplete="username" />
        <div>
          <label htmlFor="pw1" className="label">
            {t("invite.password")}
          </label>
          <input id="pw1" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" aria-describedby="pw-hint" />
          <p id="pw-hint" className="mt-1 text-xs text-ink-muted">
            {t("invite.passwordHint")}
          </p>
        </div>
        <div>
          <label htmlFor="pw2" className="label">
            {t("invite.confirm")}
          </label>
          <input id="pw2" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="input" />
        </div>
        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {t(state.error as MessageKey)}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
          {t("invite.submit")}
        </button>
      </form>
      <div className="mt-4 flex justify-center">
        <LanguageToggle />
      </div>
    </div>
  );
}
