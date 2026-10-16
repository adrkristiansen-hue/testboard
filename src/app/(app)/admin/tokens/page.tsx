import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { loadTokens } from "@/server/tokens-view";
import { AdminNav } from "@/components/settings/AdminNav";
import { TokenManager } from "@/components/account/TokenManager";

export const metadata = { title: "API tokens" };

export default async function AdminTokensPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  const { t } = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <AdminNav current="tokens" />
      <h1 className="mb-3 text-lg font-semibold">{t("tokens.allTitle")}</h1>
      <TokenManager tokens={await loadTokens()} showOwner canCreate={false} />
    </main>
  );
}
