import {
  buildSummaryRows,
  COST_EXPORT_HEADERS,
  DOCUMENT_EXPORT_HEADERS,
  documentExportItems,
  LABOR_EXPORT_HEADERS,
  mapCostExportRow,
  mapDocumentExportRow,
  mapLaborExportRow,
  type BudgetExportData,
} from "@/lib/jobs/budget/export-data";

const SEP = ";";
const BOM = "\uFEFF";

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (
    normalized.includes(SEP) ||
    normalized.includes('"') ||
    normalized.includes("\n")
  ) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function csvLine(cells: string[]): string {
  return cells.map((cell) => escapeCsvCell(cell)).join(SEP);
}

function csvSection(title: string, rows: string[][]): string[] {
  const lines = [title, ""];
  for (const row of rows) {
    lines.push(csvLine(row));
  }
  lines.push("");
  return lines;
}

export function generateBudgetCsv(data: BudgetExportData): Buffer {
  const lines: string[] = [];

  lines.push(...csvSection("PODSUMOWANIE", buildSummaryRows(data)));

  lines.push("KOSZTY");
  lines.push(csvLine([...COST_EXPORT_HEADERS]));
  for (const item of data.items) {
    lines.push(csvLine(mapCostExportRow(item)));
  }
  lines.push("");

  lines.push("ROBOCIZNA");
  lines.push(csvLine([...LABOR_EXPORT_HEADERS]));
  for (const item of data.laborItems) {
    lines.push(csvLine(mapLaborExportRow(item)));
  }
  lines.push("");

  lines.push("DOKUMENTY");
  lines.push(csvLine([...DOCUMENT_EXPORT_HEADERS]));
  for (const item of documentExportItems(data.items)) {
    lines.push(csvLine(mapDocumentExportRow(item)));
  }

  return Buffer.from(BOM + lines.join("\n"), "utf-8");
}
