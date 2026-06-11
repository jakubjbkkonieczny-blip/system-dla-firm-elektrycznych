import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import {
  buildSummaryRows,
  COST_EXPORT_HEADERS,
  LABOR_EXPORT_HEADERS,
  mapCostExportRow,
  mapLaborExportRow,
  type BudgetExportData,
} from "@/lib/jobs/budget/export-data";

// Load PDFKit from node_modules (not Turbopack bundle) so __dirname resolves to real AFM data paths.
type PDFKitConstructor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
const PDFDocument = createRequire(path.join(process.cwd(), "package.json"))("pdfkit") as PDFKitConstructor;

const PAGE_MARGIN = 40;
const FONT_REGULAR = "DejaVuSans";
const FONT_BOLD = "DejaVuSans-Bold";

function resolveDejaVuFont(fileName: string): string | null {
  try {
    const fontPath = path.join(
      process.cwd(),
      "node_modules",
      "dejavu-fonts-ttf",
      "ttf",
      fileName
    );
    return fontPath;
  } catch {
    return null;
  }
}

type PdfDoc = PDFKit.PDFDocument;

function registerFonts(doc: PdfDoc): boolean {
  const regular = resolveDejaVuFont("DejaVuSans.ttf");
  const bold = resolveDejaVuFont("DejaVuSans-Bold.ttf");
  if (!regular || !bold) return false;
  doc.registerFont(FONT_REGULAR, regular);
  doc.registerFont(FONT_BOLD, bold);
  return true;
}

function sectionTitle(doc: PdfDoc, title: string) {
  doc.moveDown(0.5);
  doc.font(FONT_BOLD).fontSize(12).text(title);
  doc.moveDown(0.25);
  doc.font(FONT_REGULAR).fontSize(9);
}

function ensureSpace(doc: PdfDoc, height = 60) {
  if (doc.y + height > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
}

function drawKeyValueTable(doc: PdfDoc, rows: [string, string][]) {
  for (const [label, value] of rows) {
    ensureSpace(doc, 16);
    doc.font(FONT_BOLD).text(`${label}: `, { continued: true });
    doc.font(FONT_REGULAR).text(value || "—");
  }
}

function drawSimpleTable(
  doc: PdfDoc,
  headers: readonly string[],
  rows: string[][],
  maxRows = 80
) {
  const slice = rows.slice(0, maxRows);
  ensureSpace(doc, 20);
  doc.font(FONT_BOLD).fontSize(8).text(headers.join(" | "));
  doc.font(FONT_REGULAR).fontSize(7);
  for (const row of slice) {
    ensureSpace(doc, 12);
    doc.text(row.join(" | "));
  }
  if (rows.length > maxRows) {
    doc.moveDown(0.25);
    doc.text(`… i jeszcze ${rows.length - maxRows} pozycji (pełna lista w CSV/XLSX).`);
  }
}

export async function generateBudgetPdf(data: BudgetExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      font: "",
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (!registerFonts(doc)) {
      reject(new Error("PDF_FONTS_UNAVAILABLE"));
      return;
    }

    doc.font(FONT_BOLD).fontSize(16).text("Kosztorys projektu");
    doc.moveDown(0.25);
    doc
      .font(FONT_REGULAR)
      .fontSize(10)
      .text(`#${data.job.jobNumber} · ${data.job.customerName}`);
    doc.text(`${data.companyName} · ${formatExportDateShort(data.exportedAt)}`);

    sectionTitle(doc, "Podsumowanie budżetu");
    drawKeyValueTable(doc, buildSummaryRows(data));

    sectionTitle(doc, "Koszty materiałów");
    drawSimpleTable(
      doc,
      COST_EXPORT_HEADERS,
      data.items.map(mapCostExportRow)
    );

    sectionTitle(doc, "Robocizna");
    drawSimpleTable(
      doc,
      LABOR_EXPORT_HEADERS,
      data.laborItems.map(mapLaborExportRow)
    );

    doc.end();
  });
}

function formatExportDateShort(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}
