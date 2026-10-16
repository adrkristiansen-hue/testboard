import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { loadProjectMeta } from "@/server/projects";
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
  await requireUser();
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();
  const item = await db.workItem.findUnique({ where: { id: itemId }, select: { projectId: true } });
  if (!item || item.projectId !== projectId) notFound();
  const meta = await loadProjectMeta(projectId);
  if (!meta) notFound();
  return (
    <ProjectProvider meta={meta}>
      <ItemPage itemId={itemId} />
    </ProjectProvider>
  );
}
