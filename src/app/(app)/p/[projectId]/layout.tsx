import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { loadProjectMeta } from "@/server/projects";
import { ProjectNav } from "@/components/ProjectNav";
import { canConfigure } from "@/lib/types";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const { t } = await getT();
  const links = [
    { href: `/p/${projectId}/boards`, label: t("nav.board"), icon: "▦" },
    { href: `/p/${projectId}/items`, label: t("nav.items"), icon: "☰" },
    { href: `/p/${projectId}/queries`, label: t("nav.queries"), icon: "⌕" },
    { href: `/p/${projectId}/dashboard`, label: t("nav.dashboard"), icon: "▥" },
    ...(canConfigure(user.role)
      ? [
          { href: `/p/${projectId}/import`, label: t("nav.import"), icon: "⇪" },
          { href: `/p/${projectId}/settings`, label: t("nav.settings"), icon: "⚙" },
        ]
      : []),
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <ProjectNav projectName={meta.name} projectKey={meta.key} links={links} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
