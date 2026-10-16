import ExcelJS from "exceljs";
import { getCurrentUser } from "@/server/auth";
import { loadProjectMeta } from "@/server/projects";
import { exportFileName } from "@/lib/columns";

/** Excel template with the recognised column headers, one example row and a sheet of valid values. */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { projectId } = await params;
  const meta = await loadProjectMeta(projectId);
  if (!meta) return new Response("Not found", { status: 404 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Work items", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Title", width: 50 },
    { header: "Type", width: 14 },
    { header: "State", width: 14 },
    { header: "Assigned to", width: 26 },
    { header: "Module", width: 32 },
    { header: "Phase", width: 10 },
    { header: "Priority", width: 9 },
    { header: "Due date", width: 12 },
    { header: "Tags", width: 20 },
    { header: "Test steps", width: 60 },
    { header: "Expected result", width: 40 },
    { header: "Description", width: 40 },
  ];
  const tt = meta.types.find((t) => t.key === "TEST_TASK");
  ws.addRow([
    "Hire employee with future start date",
    tt?.name ?? "Test Task",
    tt?.states[0]?.name ?? "",
    meta.users[0]?.email ?? "",
    meta.modules.find((m) => m.parentId)?.path ?? meta.modules[0]?.path ?? "",
    meta.phases[0]?.name ?? "",
    2,
    "2026-11-15",
    "regression; hire",
    "1. Open Add New Employee | Form opens\n2. Enter start date next month | Date accepted\n3. Save | Employee is pending hire",
    "Employee appears with status pending.",
    "",
  ]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).alignment = { wrapText: true, vertical: "top" };

  const ref = wb.addWorksheet("Valid values");
  ref.columns = [{ header: "Types", width: 22 }, { header: "Users (e-mail)", width: 30 }, { header: "Modules", width: 40 }, { header: "Phases", width: 12 }, { header: "States per type", width: 60 }];
  const lists = [meta.types.filter((t) => !t.disabled).map((t) => t.name), meta.users.map((u) => u.email), meta.modules.map((m) => m.path), meta.phases.map((p) => p.name), meta.types.map((t) => `${t.name}: ${t.states.map((s) => s.name).join(", ")}`)];
  const n = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < n; i++) ref.addRow(lists.map((l) => l[i] ?? ""));
  ref.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exportFileName(`${meta.key}-import-template`, "xlsx"))}`,
      "Cache-Control": "no-store",
    },
  });
}
