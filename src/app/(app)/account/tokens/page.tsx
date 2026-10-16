import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { loadTokens } from "@/server/tokens-view";
import { TokenManager } from "@/components/account/TokenManager";

export const metadata = { title: "API tokens" };

export default async function MyTokensPage() {
  const user = await requireUser();
  const { t } = await getT();
  return (
    <main className="mx-auto w-full max-w-4xl p-4">
      <h1 className="mb-3 text-lg font-semibold">{t("nav.apiTokens")}</h1>
      <TokenManager tokens={await loadTokens(user.id)} showOwner={false} canCreate />
    </main>
  );
}
