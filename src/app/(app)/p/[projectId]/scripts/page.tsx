import { notFound } from "next/navigation";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadProjectMeta, scopeMeta } from "@/server/projects";
import { loadScriptSummaries } from "@/server/testscripts";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ScriptLibrary } from "@/components/testing/ScriptLibrary";

export const metadata = { title: "Test scripts" };

export default async function ScriptsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { access } = await projectPage(projectId);
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const scripts = await loadScriptSummaries(access);
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <ScriptLibrary scripts={scripts} />
    </ProjectProvider>
  );
}
