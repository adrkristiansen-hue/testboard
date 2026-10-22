"use server";

import { z } from "zod";
import { db } from "../db";
import { requireEditor } from "../auth";
import { requirePermission, visibleItemsWhere } from "../access";
import { run, type ActionResult } from "../result";
import { UserError, createWorkItem } from "../workitems";
import { loadProjectMeta } from "../projects";
import { notifyBulkAssigned } from "../notify";
import { audit } from "../audit";
import { parseImportFile, type ParsedFile } from "../import-parse";
import { IMPORT_MAX_ROWS, validateImport, type ImportTarget } from "@/lib/import";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function readImportFile(formData: FormData): Promise<ActionResult<ParsedFile>> {
  return run(async () => {
    const user = await requireEditor();
    await requirePermission(user, String(formData.get("projectId") ?? ""), "items.import");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a file.");
    if (file.size > MAX_FILE_BYTES) throw new UserError("The file is larger than 10 MB.");
    const sheet = formData.get("sheet");
    try {
      return await parseImportFile(file, typeof sheet === "string" && sheet ? sheet : undefined);
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "Could not read the file.");
    }
  });
}

const importSchema = z.object({
  projectId: z.string(),
  fileName: z.string().max(255),
  mapping: z.array(z.string()).max(200),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(IMPORT_MAX_ROWS),
  defaults: z.object({ typeId: z.string(), phaseId: z.string().nullable(), moduleId: z.string().nullable() }),
  /** Import the valid rows and skip the rest; otherwise any error stops the import. */
  skipInvalid: z.boolean(),
});

export async function importItems(input: z.infer<typeof importSchema>): Promise<ActionResult<{ created: number; skipped: number; firstId: number | null; lastId: number | null }>> {
  return run(async () => {
    const user = await requireEditor();
    const p = importSchema.parse(input);
    const access = await requirePermission(user, p.projectId, "items.import");
    const meta = await loadProjectMeta(p.projectId);
    if (!meta) throw new UserError("Unknown project.");
    if (!p.mapping.includes("title")) throw new UserError("Map a column to Title.");
    const existing = new Set((await db.workItem.findMany({ where: { projectId: meta.id, AND: [visibleItemsWhere(access)] }, select: { id: true } })).map((r) => r.id));
    // Validate again on the server: never trust the preview.
    const results = validateImport(p.rows, p.mapping as ImportTarget[], meta, p.defaults, existing);
    const invalid = results.filter((r) => !r.item);
    if (invalid.length && !p.skipInvalid) throw new UserError(`${invalid.length} rows have errors. Fix them or choose to skip invalid rows.`);

    const ids: number[] = [];
    const byAssignee = new Map<string, number[]>();
    for (const r of results) {
      if (!r.item) continue;
      const id = await createWorkItem({ projectId: meta.id, ...r.item }, user, { suppressAssignedNotification: true });
      ids.push(id);
      if (r.item.assignedToId) byAssignee.set(r.item.assignedToId, [...(byAssignee.get(r.item.assignedToId) ?? []), id]);
    }
    await notifyBulkAssigned(user, byAssignee);
    await audit(user.id, "import.workitems", "Project", meta.id, { file: p.fileName, created: ids.length, skipped: invalid.length });
    return { created: ids.length, skipped: invalid.length, firstId: ids[0] ?? null, lastId: ids.at(-1) ?? null };
  });
}
