import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { getT } from "@/server/locale";
import { loadVisibleItems, loadProjectMeta } from "@/server/projects";
import { accessFor, can, canView } from "@/server/access";
import { toCsv, toXlsx } from "@/server/export";
import { columnCatalogue, columnNames, exportFileName, resolveColumns } from "@/lib/columns";

const bodySchema = z.object({
  format: z.enum(["xlsx", "csv"]),
  /** Ids in display order */
  ids: z.array(z.number().int().positive()).max(20_000),
  columns: z.array(z.string()).max(60),
  name: z.string().max(100).optional(),
});

/** Export the rows and columns currently shown in a list or query. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { projectId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid request", { status: 400 });
  const { format, ids, columns, name } = parsed.data;

  const meta = await loadProjectMeta(projectId);
  if (!meta) return new Response("Not found", { status: 404 });
  const access = await accessFor(user, projectId);
  if (!canView(access)) return new Response("Not found", { status: 404 });
  if (!can(access, "items.export")) return new Response("Your role does not allow export", { status: 403 });
  const { t, locale } = await getT();
  const rows = await loadVisibleItems(access, meta, { id: { in: ids } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = ids.map((id) => byId.get(id)).filter((r) => !!r);
  const cols = resolveColumns(columns, columnCatalogue(meta));
  const headers = cols.map((c) => (c.labelKey ? t(c.labelKey) : (locale === "nb" && c.labelNb) || c.label || c.key));
  const names = columnNames(meta);
  const base = name || `${meta.key}-${t("list.title")}`;

  if (format === "xlsx") {
    const buf = await toXlsx(name || t("list.title"), headers, items, cols, names);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exportFileName(base, "xlsx"))}`,
        "Cache-Control": "no-store",
      },
    });
  }
  const csv = toCsv(headers, items, cols, names, locale === "nb" ? ";" : ",");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exportFileName(base, "csv"))}`,
      "Cache-Control": "no-store",
    },
  });
}
