"use server";

import { z } from "zod";
import { db } from "../db";
import { getCurrentUser, ForbiddenError } from "../auth";
import { run, type ActionResult } from "../result";
import { UserError } from "../workitems";
import { audit } from "../audit";
import { OPS, type Clause } from "@/lib/query";
import { can, requireProjectAccess } from "../access";

const conditionSchema = z.object({ field: z.string().max(80), op: z.enum(OPS), value: z.unknown().optional() });
const clauseSchema: z.ZodType<Clause> = z.lazy(() => z.union([z.object({ logic: z.enum(["and", "or"]), clauses: z.array(clauseSchema).max(50) }), conditionSchema]));
const definitionSchema = z.object({
  root: z.object({ logic: z.enum(["and", "or"]), clauses: z.array(clauseSchema).max(50) }),
  sort: z.array(z.object({ field: z.string().max(80), dir: z.enum(["asc", "desc"]) })).max(5).optional(),
});

const saveSchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  name: z.string().trim().min(1).max(100),
  shared: z.boolean(),
  mode: z.enum(["FLAT", "TREE"]),
  definition: definitionSchema,
  columns: z.array(z.string().max(80)).max(60),
});

async function me() {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Not signed in.");
  return user;
}

/** Owners edit their own queries; admins and test leads also manage shared queries. Only they can share. */
export async function saveQuery(input: z.infer<typeof saveSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await me();
    const q = saveSchema.parse(input);
    const access = await requireProjectAccess(user, q.projectId);
    const lead = can(access, "queries.share");
    if (q.shared && !lead) throw new ForbiddenError("Your role in this project does not allow sharing queries.");
    const data = { name: q.name, shared: q.shared, mode: q.mode, definition: JSON.stringify(q.definition), columns: JSON.stringify(q.columns) };
    if (q.id) {
      const existing = await db.savedQuery.findUnique({ where: { id: q.id } });
      if (!existing || existing.projectId !== q.projectId) throw new UserError("Query not found.", "NOT_FOUND");
      if (existing.ownerId !== user.id && !(existing.shared && lead)) throw new ForbiddenError("You cannot change this query.");
      await db.savedQuery.update({ where: { id: q.id }, data });
      if (q.shared || existing.shared) await audit(user.id, "query.update", "SavedQuery", q.id, { name: q.name, shared: q.shared });
      return { id: q.id };
    }
    const project = await db.project.findUnique({ where: { id: q.projectId }, select: { id: true } });
    if (!project) throw new UserError("Unknown project.");
    const created = await db.savedQuery.create({ data: { ...data, projectId: q.projectId, ownerId: user.id } });
    if (q.shared) await audit(user.id, "query.create", "SavedQuery", created.id, { name: q.name, shared: true });
    return { id: created.id };
  });
}

export async function deleteQuery(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await me();
    const existing = await db.savedQuery.findUnique({ where: { id } });
    if (!existing) throw new UserError("Query not found.", "NOT_FOUND");
    const access = await requireProjectAccess(user, existing.projectId);
    if (existing.ownerId !== user.id && !(existing.shared && can(access, "queries.share"))) throw new ForbiddenError("You cannot delete this query.");
    await db.savedQuery.delete({ where: { id } });
    if (existing.shared) await audit(user.id, "query.delete", "SavedQuery", id, { name: existing.name });
    return undefined;
  });
}
