import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadProjectMeta, scopeMeta } from "@/server/projects";
import { loadScript } from "@/server/testscripts";
import { db } from "@/server/db";
import { scriptKey } from "@/lib/testscripts";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ScriptEditor } from "@/components/testing/ScriptEditor";

type Params = { projectId: string; scriptId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { scriptId } = await params;
  const s = await db.testScript.findUnique({ where: { id: scriptId }, select: { number: true, title: true } });
  return { title: s ? `${scriptKey(s.number)} ${s.title}` : "Test script" };
}

export default async function ScriptPage({ params }: { params: Promise<Params> }) {
  const { projectId, scriptId } = await params;
  const { access } = await projectPage(projectId);
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const script = await loadScript(access, scriptId);
  if (!script) notFound();
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <ScriptEditor key={`${script.id}-${script.updatedAt}`} script={script} />
    </ProjectProvider>
  );
}
