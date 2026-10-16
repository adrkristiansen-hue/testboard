import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";

export default async function BoardsIndex({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  // Keep filters (e.g. ?query=<saved query>) when forwarding to the user's team board.
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))).toString();
  const user = await requireUser();
  const teams = await db.team.findMany({ where: { projectId }, orderBy: { name: "asc" }, include: { members: { where: { userId: user.id } } } });
  const mine = teams.find((t) => t.members.length > 0) ?? teams[0];
  if (mine) redirect(`/p/${projectId}/boards/${mine.id}${qs ? `?${qs}` : ""}`);
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
