import "server-only";

import ExcelJS from "exceljs";
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
import { APP_BRANDING } from "@/lib/branding";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" },
};

function autoSizeColumns(sheet: ExcelJS.Worksheet, minWidth = 10, maxWidth = 48) {
  sheet.columns.forEach((column) => {
    let maxLen = minWidth;
    if (column.eachCell) {
      column.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value == null ? "" : String(cell.value);
        maxLen = Math.max(maxLen, Math.min(maxWidth, value.length + 2));
      });
    }
    column.width = maxLen;
  });
}

function addTableSheet(
  sheet: ExcelJS.Worksheet,
  headers: readonly string[],
  rows: string[][]
) {
  const headerRow = sheet.addRow([...headers]);
  headerRow.font = { bold: true };
  headerRow.fill = HEADER_FILL;
  for (const row of rows) {
    sheet.addRow(row);
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoSizeColumns(sheet);
}

export async function generateBudgetXlsx(data: BudgetExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_BRANDING.exportDocumentCreator;
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Podsumowanie");
  summarySheet.addRow(["Pole", "Wartość"]).font = { bold: true };
  summarySheet.getRow(1).fill = HEADER_FILL;
  for (const [label, value] of buildSummaryRows(data)) {
    summarySheet.addRow([label, value]);
  }
  summarySheet.views = [{ state: "frozen", ySplit: 1 }];
  autoSizeColumns(summarySheet);

  addTableSheet(
    workbook.addWorksheet("Koszty"),
    COST_EXPORT_HEADERS,
    data.items.map(mapCostExportRow)
  );

  addTableSheet(
    workbook.addWorksheet("Robocizna"),
    LABOR_EXPORT_HEADERS,
    data.laborItems.map(mapLaborExportRow)
  );

  addTableSheet(
    workbook.addWorksheet("Dokumenty"),
    DOCUMENT_EXPORT_HEADERS,
    documentExportItems(data.items).map(mapDocumentExportRow)
  );

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
