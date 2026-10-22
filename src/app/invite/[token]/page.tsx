import { findValidInvite } from "@/server/invites";
import { getT } from "@/server/locale";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findValidInvite(token);
  const { t } = await getT();
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      {invite ? (
        <AcceptInviteForm token={token} name={invite.user.name} email={invite.user.email} />
      ) : (
        <div className="card-panel max-w-sm space-y-3 p-6 text-center">
          <h1 className="text-lg font-semibold">{t("invite.invalidTitle")}</h1>
          <p className="text-sm text-ink-muted">{t("invite.invalid")}</p>
          <a href="/login" className="btn btn-secondary">
            {t("login.submit")}
          </a>
        </div>
      )}
    </main>
  );
}
