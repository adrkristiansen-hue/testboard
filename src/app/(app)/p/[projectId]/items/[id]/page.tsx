import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { projectPage } from "@/server/page-access";
import { canSeeItem, toClientAccess } from "@/server/access";
import { loadProjectMeta } from "@/server/projects";
import { scopeMeta } from "@/server/projects";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ItemPage } from "@/components/item/ItemPage";

type Params = { projectId: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const item = Number.isInteger(Number(id)) ? await db.workItem.findUnique({ where: { id: Number(id) }, select: { title: true } }) : null;
  return { title: item ? `#${id} ${item.title}` : "Work item" };
}

export default async function WorkItemPage({ params }: { params: Promise<Params> }) {
  const { projectId, id } = await params;
  const { access } = await projectPage(projectId);
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();
  const item = await db.workItem.findUnique({ where: { id: itemId }, select: { projectId: true, moduleId: true } });
  if (!item || item.projectId !== projectId || !canSeeItem(access, item)) notFound();
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  return (
    <ProjectProvider meta={scopeMeta(meta, access)} access={toClientAccess(access)}>
      <ItemPage itemId={itemId} />
    </ProjectProvider>
  );
}
