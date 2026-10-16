import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { ColumnDef, ColumnNames } from "@/lib/columns";
import { csvSafe, exportRows } from "@/lib/columns";
import type { ItemView } from "@/lib/types";

export async function toXlsx(sheetName: string, headers: string[], items: ItemView[], cols: ColumnDef[], names: ColumnNames): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TestBoard";
  wb.created = new Date();
  // Sheet names: max 31 chars, no []:*?/\
  const ws = wb.addWorksheet(sheetName.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Work items", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c, i) => ({ header: headers[i], key: c.key, width: c.key === "title" ? 60 : c.key === "module" ? 32 : 16 }));
  for (const row of exportRows(items, cols, names)) {
    ws.addRow(
      row.map((v, i) => {
        // Real dates so Excel can filter and sort them; strings are always written as text, never as formulas.
        if (cols[i].isDate && typeof v === "string" && v) return new Date(`${v}T00:00:00Z`);
        return v ?? "";
      }),
    );
  }
  cols.forEach((c, i) => {
    if (c.isDate) ws.getColumn(i + 1).numFmt = "yyyy-mm-dd";
  });
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** UTF-8 with BOM so Excel shows æøå correctly. Norwegian Excel expects ";" as separator. */
export function toCsv(headers: string[], items: ItemView[], cols: ColumnDef[], names: ColumnNames, delimiter: "," | ";"): string {
  const data = exportRows(items, cols, names).map((r) => r.map(csvSafe));
  return "﻿" + Papa.unparse({ fields: headers.map((h) => String(csvSafe(h))), data }, { delimiter, newline: "\r\n" });
}
