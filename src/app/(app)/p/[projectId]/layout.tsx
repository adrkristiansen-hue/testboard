import { notFound } from "next/navigation";
import { getT } from "@/server/locale";
import { loadProjectMeta } from "@/server/projects";
import { projectPage } from "@/server/page-access";
import { ProjectNav } from "@/components/ProjectNav";
import { roleLabel } from "@/lib/permissions";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { access } = await projectPage(projectId);
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const { t, locale } = await getT();
  const p = access.permissions;
  const links = [
    { href: `/p/${projectId}/boards`, label: t("nav.board"), icon: "▦" },
    { href: `/p/${projectId}/items`, label: t("nav.items"), icon: "☰" },
    { href: `/p/${projectId}/scripts`, label: t("nav.scripts"), icon: "☑" },
    { href: `/p/${projectId}/queries`, label: t("nav.queries"), icon: "⌕" },
    { href: `/p/${projectId}/dashboard`, label: t("nav.dashboard"), icon: "▥" },
    ...(p.has("items.import") ? [{ href: `/p/${projectId}/import`, label: t("nav.import"), icon: "⇪" }] : []),
    ...(p.has("project.configure") || p.has("boards.configure") || p.has("access.manage") ? [{ href: `/p/${projectId}/settings`, label: t("nav.settings"), icon: "⚙" }] : []),
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <ProjectNav projectName={meta.name} projectKey={meta.key} links={links} roleName={access.roleName ? roleLabel(access.roleName, locale) : access.isAdmin ? t("role.ADMIN") : null} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">{children}</div>
    </div>
  );
}
