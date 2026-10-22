import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { projectPage } from "@/server/page-access";
import { toClientAccess } from "@/server/access";
import { loadProjectMeta, scopeMeta } from "@/server/projects";
import { loadRun } from "@/server/testscripts";
import { ProjectProvider } from "@/components/ProjectProvider";
import { TestRunner } from "@/components/testing/TestRunner";

type Params = { projectId: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const item = Number.isInteger(Number(id)) ? await db.workItem.findUnique({ where: { id: Number(id) }, select: { title: true } }) : null;
  return { title: item ? `Run #${id} ${item.title}` : "Test run" };
}

export default async function RunPage({ params }: { params: Promise<Params> }) {
  const { projectId, id } = await params;
  const { user, access } = await projectPage(projectId);
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  const view = await loadRun(access, itemId, user.id);
  if (!view) notFound();
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <TestRunner key={itemId} initial={view} />
    </ProjectProvider>
  );
}
