import "server-only";
import { db } from "./db";
import { parseQueryDefinition } from "@/lib/query";
import { parseStringArray } from "@/lib/fields";
import type { SavedQueryView } from "@/lib/types";

/** Shared queries plus the user's own personal queries. */
export async function loadQueries(projectId: string, userId: string): Promise<SavedQueryView[]> {
  const rows = await db.savedQuery.findMany({
    where: { projectId, OR: [{ shared: true }, { ownerId: userId }] },
    include: { owner: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shared: r.shared,
    mode: r.mode === "TREE" ? "TREE" : "FLAT",
    definition: parseQueryDefinition(r.definition),
    columns: parseStringArray(r.columns),
    ownerId: r.ownerId,
    ownerName: r.owner.name,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
