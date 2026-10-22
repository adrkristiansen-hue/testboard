import { db } from "@/server/db";
import { apiHandler, json } from "@/server/api/http";
import { visibleProjectIds } from "@/server/access";

export const GET = apiHandler("read", async (_req, user) => {
  const ids = await visibleProjectIds(user);
  const rows = await db.project.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "asc" }, include: { _count: { select: { workItems: true } } } });
  return json({ projects: rows.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description, workItemCount: p._count.workItems })) });
});
