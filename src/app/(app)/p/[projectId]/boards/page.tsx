import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";

export default async function BoardsIndex({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const teams = await db.team.findMany({ where: { projectId }, orderBy: { name: "asc" }, include: { members: { where: { userId: user.id } } } });
  const mine = teams.find((t) => t.members.length > 0) ?? teams[0];
  if (mine) redirect(`/p/${projectId}/boards/${mine.id}`);
  const { t } = await getT();
  return (
    <main className="p-6">
      <p className="text-ink-muted">{t("board.noTeams")}</p>
      <Link href={`/p/${projectId}/settings`} className="btn btn-secondary mt-3">
        {t("nav.settings")}
      </Link>
    </main>
  );
}
