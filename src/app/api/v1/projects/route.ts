import { db } from "@/server/db";
import { apiHandler, json } from "@/server/api/http";

export const GET = apiHandler("read", async () => {
  const rows = await db.project.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { workItems: true } } } });
  return json({ projects: rows.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description, workItemCount: p._count.workItems })) });
});
