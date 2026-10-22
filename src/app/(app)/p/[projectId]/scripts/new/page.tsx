import { notFound } from "next/navigation";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadProjectMeta, scopeMeta } from "@/server/projects";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ScriptEditor } from "@/components/testing/ScriptEditor";

export const metadata = { title: "New test script" };

export default async function NewScriptPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { access } = await projectPage(projectId, "scripts.edit");
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <ScriptEditor script={null} />
    </ProjectProvider>
  );
}
