import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { IMPORT_MAX_ROWS } from "@/lib/import";

export type ImportCell = string | number | null;
export interface ParsedFile {
  sheets: string[];
  sheet: string;
  headers: string[];
  rows: ImportCell[][];
  truncated: boolean;
}

/** Plain value of an ExcelJS cell: formulas give their result, rich text and hyperlinks give their text, dates become yyyy-mm-dd. */
function cellValue(v: ExcelJS.CellValue): ImportCell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ("error" in v) return null;
  }
  return String(v);
}

function finish(sheets: string[], sheet: string, table: ImportCell[][]): ParsedFile {
  const [head = [], ...rest] = table;
  const width = Math.max(head.length, ...rest.slice(0, 50).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(head[i] ?? "").trim() || `Column ${i + 1}`);
  return { sheets, sheet, headers, rows: rest.slice(0, IMPORT_MAX_ROWS).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null)), truncated: rest.length > IMPORT_MAX_ROWS };
}

export async function parseImportFile(file: File, sheetName?: string): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheets = wb.worksheets.map((w) => w.name);
    const ws = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0];
    if (!ws) throw new Error("The workbook has no sheets.");
    const table: ImportCell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      if (n > IMPORT_MAX_ROWS + 1) return;
      const values = row.values as ExcelJS.CellValue[]; // 1-based
      table[n - 1] = values.slice(1).map(cellValue);
    });
    return finish(sheets, ws.name, Array.from(table, (r) => r ?? []));
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    // Strip BOM; let papaparse detect "," vs ";" (Norwegian Excel exports use ";").
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false, delimitersToGuess: [",", ";", "\t", "|"] });
    return finish([], "", parsed.data.map((r) => r.map((c) => (c === "" ? null : c))));
  }
  throw new Error("Unsupported file type. Use .xlsx or .csv.");
}
