import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import { BUDGET_STATUS_LABELS } from "@/lib/jobs/budget/config";
import {
  formatExportDate,
  formatExportPercent,
  formatExportYesNo,
  itemDocumentLabel,
  laborHoursLabel,
  type BudgetExportData,
  type BudgetExportJobInfo,
} from "@/lib/jobs/budget/export-data";
import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetItemDto, JobBudgetLaborItemDto } from "@/lib/jobs/budget/types";

// Load PDFKit from node_modules (not Turbopack bundle) so __dirname resolves to real AFM data paths.
type PDFKitConstructor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
const PDFDocument = createRequire(path.join(process.cwd(), "package.json"))("pdfkit") as PDFKitConstructor;

const PAGE_MARGIN = 40;
const FOOTER_HEIGHT = 32;
const FONT_REGULAR = "DejaVuSans";
const FONT_BOLD = "DejaVuSans-Bold";

const COLORS = {
  primary: "#D97706",
  primaryDark: "#B45309",
  primaryLight: "#FEF3C7",
  slate900: "#0F172A",
  slate700: "#334155",
  slate500: "#64748B",
  slate200: "#E2E8F0",
  slate50: "#F8FAFC",
  white: "#FFFFFF",
} as const;

const JOB_STATUS_LABELS: Record<string, string> = {
  new: "Nowe",
  scheduled: "Zaplanowane",
  in_progress: "W trakcie",
  done: "Zakończone",
  cancelled: "Anulowane",
};

type PdfDoc = PDFKit.PDFDocument;

type TableColumn<T> = {
  header: string;
  fraction: number;
  align?: "left" | "right" | "center";
  value: (row: T) => string;
};

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

function registerFonts(doc: PdfDoc): boolean {
  const regular = resolveDejaVuFont("DejaVuSans.ttf");
  const bold = resolveDejaVuFont("DejaVuSans-Bold.ttf");
  if (!regular || !bold) return false;
  doc.registerFont(FONT_REGULAR, regular);
  doc.registerFont(FONT_BOLD, bold);
  return true;
}

function contentWidth(doc: PdfDoc): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

function contentBottom(doc: PdfDoc): number {
  return doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;
}

function resetInk(doc: PdfDoc) {
  doc.fillColor(COLORS.slate700).strokeColor(COLORS.slate200);
}

function ensureSpace(doc: PdfDoc, height: number) {
  if (doc.y + height > contentBottom(doc)) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  }
}

function formatExportDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatJobStatus(status: string): string {
  return JOB_STATUS_LABELS[status] ?? status;
}

function formatAddress(job: BudgetExportJobInfo): string {
  const parts = [job.addressStreet, job.addressCity].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function drawLightningBolt(doc: PdfDoc, x: number, y: number, size: number) {
  const s = size / 24;
  doc.save();
  doc.fillColor(COLORS.white);
  doc
    .moveTo(x + 14 * s, y)
    .lineTo(x + 6 * s, y + 13 * s)
    .lineTo(x + 11 * s, y + 13 * s)
    .lineTo(x + 8 * s, y + 24 * s)
    .lineTo(x + 18 * s, y + 10 * s)
    .lineTo(x + 12 * s, y + 10 * s)
    .closePath()
    .fill();
  doc.restore();
  resetInk(doc);
}

function drawBrandLogo(doc: PdfDoc, x: number, y: number) {
  const size = 38;
  doc.save();
  doc.roundedRect(x, y, size, size, 8).fill(COLORS.primary);
  drawLightningBolt(doc, x + 7, y + 7, 24);
  doc.restore();
  resetInk(doc);

  doc
    .font(FONT_BOLD)
    .fontSize(18)
    .fillColor(COLORS.slate900)
    .text("Elektra", x + size + 10, y + 4, { lineBreak: false });

  doc
    .font(FONT_REGULAR)
    .fontSize(8)
    .fillColor(COLORS.slate500)
    .text("System zarządzania firmą elektryczną", x + size + 10, y + 24, { lineBreak: false });
}

function drawDocumentHeader(doc: PdfDoc, data: BudgetExportData) {
  const width = contentWidth(doc);
  const top = PAGE_MARGIN;
  drawBrandLogo(doc, PAGE_MARGIN, top);

  const rightX = PAGE_MARGIN + width * 0.52;
  doc
    .font(FONT_REGULAR)
    .fontSize(8)
    .fillColor(COLORS.slate500)
    .text("Wykonawca", rightX, top + 2, { width: width * 0.48, align: "right" });
  doc
    .font(FONT_BOLD)
    .fontSize(11)
    .fillColor(COLORS.slate900)
    .text(data.companyName, rightX, top + 14, { width: width * 0.48, align: "right" });

  const titleY = top + 58;
  doc
    .roundedRect(PAGE_MARGIN, titleY, width, 42, 6)
    .fillAndStroke(COLORS.primaryLight, COLORS.primary);

  doc
    .font(FONT_BOLD)
    .fontSize(20)
    .fillColor(COLORS.primaryDark)
    .text("Kosztorys projektu", PAGE_MARGIN + 16, titleY + 11, { width: width - 32 });

  doc.y = titleY + 54;
}

function drawInfoPair(
  doc: PdfDoc,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string
) {
  doc.font(FONT_REGULAR).fontSize(7.5).fillColor(COLORS.slate500).text(label, x, y, { width });
  doc.font(FONT_BOLD).fontSize(9.5).fillColor(COLORS.slate900).text(value, x, y + 11, { width });
}

function drawInfoSection(doc: PdfDoc, data: BudgetExportData) {
  const width = contentWidth(doc);
  const boxH = 88;
  ensureSpace(doc, boxH + 16);

  const y = doc.y + 8;
  doc.roundedRect(PAGE_MARGIN, y, width, boxH, 6).fillAndStroke(COLORS.slate50, COLORS.slate200);

  const colW = (width - 32) / 2;
  const leftX = PAGE_MARGIN + 16;
  const rightX = leftX + colW + 8;

  drawInfoPair(doc, leftX, y + 14, colW, "Numer zlecenia", `#${data.job.jobNumber}`);
  drawInfoPair(doc, rightX, y + 14, colW, "Adres", formatAddress(data.job));
  drawInfoPair(doc, leftX, y + 40, colW, "Klient", data.job.customerName || "—");
  drawInfoPair(doc, rightX, y + 40, colW, "Status zlecenia", formatJobStatus(data.job.status));
  drawInfoPair(doc, leftX, y + 66, colW, "Data eksportu", formatExportDateTime(data.exportedAt));

  doc.y = y + boxH + 18;
  resetInk(doc);
}

function drawSectionTitle(doc: PdfDoc, title: string) {
  ensureSpace(doc, 36);
  const width = contentWidth(doc);
  const y = doc.y + 6;

  doc.rect(PAGE_MARGIN, y, 4, 18).fill(COLORS.primary);
  doc
    .font(FONT_BOLD)
    .fontSize(13)
    .fillColor(COLORS.slate900)
    .text(title, PAGE_MARGIN + 12, y + 1, { width: width - 12 });

  doc.moveTo(PAGE_MARGIN, y + 26).lineTo(PAGE_MARGIN + width, y + 26).lineWidth(0.5).stroke(COLORS.slate200);
  doc.y = y + 34;
  resetInk(doc);
}

function drawSummaryBox(doc: PdfDoc, data: BudgetExportData) {
  const { summary } = data;
  const width = contentWidth(doc);
  const boxH = 108;
  ensureSpace(doc, boxH + 12);

  const y = doc.y;
  doc.roundedRect(PAGE_MARGIN, y, width, boxH, 6).fillAndStroke(COLORS.white, COLORS.slate200);

  const metrics: { label: string; value: string; highlight?: boolean }[] = [
    { label: "Budżet projektu", value: formatPlnFromCents(summary.totalBudgetCents), highlight: true },
    { label: "Suma planowanych kosztów", value: formatPlnFromCents(summary.totalPlannedCents), highlight: true },
    { label: "Pozostały budżet", value: formatPlnFromCents(summary.remainingCents), highlight: true },
    { label: "Koszty brutto", value: formatPlnFromCents(summary.plannedCostsGrossCents) },
    { label: "Szacowana marża", value: formatPlnFromCents(summary.profitCents) },
    { label: "Wykorzystanie budżetu", value: formatExportPercent(summary.budgetUtilizationPercent) },
    { label: "Status budżetu", value: BUDGET_STATUS_LABELS[summary.status] },
    { label: "Rentowność", value: formatExportPercent(summary.profitabilityPercent) },
  ];

  const cols = 4;
  const gap = 8;
  const cellW = (width - 24 - gap * (cols - 1)) / cols;
  const cellH = 42;

  metrics.forEach((metric, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cellX = PAGE_MARGIN + 12 + col * (cellW + gap);
    const cellY = y + 12 + row * (cellH + 6);

    if (metric.highlight) {
      doc.roundedRect(cellX, cellY, cellW, cellH, 4).fill(COLORS.primaryLight);
    }

    doc
      .font(FONT_REGULAR)
      .fontSize(7)
      .fillColor(COLORS.slate500)
      .text(metric.label, cellX + 8, cellY + 8, { width: cellW - 16 });

    doc
      .font(metric.highlight ? FONT_BOLD : FONT_REGULAR)
      .fontSize(metric.highlight ? 11 : 9.5)
      .fillColor(metric.highlight ? COLORS.primaryDark : COLORS.slate900)
      .text(metric.value, cellX + 8, cellY + 20, { width: cellW - 16 });
  });

  doc.y = y + boxH + 16;
  resetInk(doc);
}

function columnWidths(doc: PdfDoc, columns: TableColumn<unknown>[]): number[] {
  const total = contentWidth(doc);
  return columns.map((col) => col.fraction * total);
}

function measureRowHeight(
  doc: PdfDoc,
  columns: TableColumn<unknown>[],
  widths: number[],
  row: unknown,
  fontSize: number,
  padding: number
): number {
  let maxH = fontSize + padding * 2;
  columns.forEach((col, i) => {
    const text = col.value(row as never) || "—";
    doc.font(FONT_REGULAR).fontSize(fontSize);
    const h = doc.heightOfString(text, { width: widths[i] - padding * 2, align: col.align ?? "left" });
    maxH = Math.max(maxH, h + padding * 2);
  });
  return maxH;
}

function drawTableHeader(
  doc: PdfDoc,
  columns: TableColumn<unknown>[],
  widths: number[],
  fontSize: number,
  padding: number
): number {
  const headerH = fontSize + padding * 2 + 4;
  const y = doc.y;
  const totalW = widths.reduce((a, b) => a + b, 0);

  doc.rect(PAGE_MARGIN, y, totalW, headerH).fill(COLORS.slate900);

  let x = PAGE_MARGIN;
  columns.forEach((col, i) => {
    doc
      .font(FONT_BOLD)
      .fontSize(fontSize)
      .fillColor(COLORS.white)
      .text(col.header, x + padding, y + padding + 1, {
        width: widths[i] - padding * 2,
        align: col.align ?? "left",
        lineBreak: false,
      });
    x += widths[i];
  });

  doc.y = y + headerH;
  resetInk(doc);
  return headerH;
}

function drawDataTable<T>(doc: PdfDoc, columns: TableColumn<T>[], rows: T[]) {
  if (rows.length === 0) {
    ensureSpace(doc, 24);
    doc
      .font(FONT_REGULAR)
      .fontSize(9)
      .fillColor(COLORS.slate500)
      .text("Brak pozycji.", PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
    doc.y += 20;
    return;
  }

  const fontSize = 7.5;
  const padding = 4;
  const widths = columnWidths(doc, columns as TableColumn<unknown>[]);
  const totalW = widths.reduce((a, b) => a + b, 0);

  const drawHeader = () => drawTableHeader(doc, columns as TableColumn<unknown>[], widths, fontSize, padding);

  drawHeader();

  rows.forEach((row, rowIndex) => {
    const rowH = measureRowHeight(doc, columns as TableColumn<unknown>[], widths, row, fontSize, padding);
    if (doc.y + rowH > contentBottom(doc)) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
      drawHeader();
    }

    const y = doc.y;
    const fill = rowIndex % 2 === 0 ? COLORS.white : COLORS.slate50;
    doc.rect(PAGE_MARGIN, y, totalW, rowH).fill(fill);
    doc.rect(PAGE_MARGIN, y, totalW, rowH).stroke(COLORS.slate200);

    let x = PAGE_MARGIN;
    columns.forEach((col, i) => {
      const text = col.value(row) || "—";
      if (i > 0) {
        doc.moveTo(x, y).lineTo(x, y + rowH).lineWidth(0.5).stroke(COLORS.slate200);
      }
      doc
        .font(FONT_REGULAR)
        .fontSize(fontSize)
        .fillColor(COLORS.slate700)
        .text(text, x + padding, y + padding, {
          width: widths[i] - padding * 2,
          align: col.align ?? "left",
        });
      x += widths[i];
    });

    doc.y = y + rowH;
    resetInk(doc);
  });

  doc.y += 10;
}

function drawFooters(doc: PdfDoc, exportedAt: string) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const width = contentWidth(doc);
  const footerY = doc.page.height - PAGE_MARGIN + 6;
  const dateLabel = formatExportDateTime(exportedAt);

  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    doc
      .moveTo(PAGE_MARGIN, footerY - 8)
      .lineTo(PAGE_MARGIN + width, footerY - 8)
      .lineWidth(0.5)
      .stroke(COLORS.slate200);

    doc
      .font(FONT_REGULAR)
      .fontSize(7)
      .fillColor(COLORS.slate500)
      .text(`Wygenerowano przez Elektra · ${dateLabel}`, PAGE_MARGIN, footerY, {
        width: width * 0.7,
        align: "left",
        lineBreak: false,
      });

    doc
      .font(FONT_REGULAR)
      .fontSize(7)
      .fillColor(COLORS.slate500)
      .text(`Strona ${i + 1} z ${total}`, PAGE_MARGIN, footerY, {
        width,
        align: "right",
        lineBreak: false,
      });
  }

  resetInk(doc);
}

const COST_PDF_COLUMNS: TableColumn<JobBudgetItemDto>[] = [
  { header: "Nazwa", fraction: 0.24, value: (r) => r.name },
  { header: "Kategoria", fraction: 0.12, value: (r) => r.category },
  { header: "Dostawca", fraction: 0.13, value: (r) => r.supplier ?? "—" },
  { header: "Netto", fraction: 0.1, align: "right", value: (r) => formatPlnFromCents(r.netAmountCents ?? r.grossAmountCents) },
  { header: "VAT", fraction: 0.09, align: "right", value: (r) => formatPlnFromCents(r.taxAmountCents) },
  { header: "Brutto", fraction: 0.1, align: "right", value: (r) => formatPlnFromCents(r.grossAmountCents) },
  { header: "Data", fraction: 0.09, align: "center", value: (r) => formatExportDate(r.plannedDate) || "—" },
  { header: "Odlicz.", fraction: 0.08, align: "center", value: (r) => formatExportYesNo(r.deductible) },
  { header: "Dokument", fraction: 0.05, value: (r) => itemDocumentLabel(r) },
];

const LABOR_PDF_COLUMNS: TableColumn<JobBudgetLaborItemDto>[] = [
  { header: "Pracownik", fraction: 0.2, value: (r) => r.userLabel ?? "—" },
  { header: "Typ współpracy", fraction: 0.16, value: (r) => r.employmentTypeLabel },
  { header: "Stawka/h", fraction: 0.12, align: "right", value: (r) => formatPlnFromCents(r.hourlyRateCents) },
  { header: "Godziny", fraction: 0.1, align: "right", value: (r) => laborHoursLabel(r) },
  { header: "Koszt podst.", fraction: 0.14, align: "right", value: (r) => formatPlnFromCents(r.baseLaborCostCents) },
  { header: "Koszt zatr.", fraction: 0.14, align: "right", value: (r) => formatPlnFromCents(r.employerLaborCostCents) },
  { header: "Data", fraction: 0.1, align: "center", value: (r) => formatExportDate(r.plannedDate) || "—" },
  { header: "Notatka", fraction: 0.04, value: (r) => r.note ?? "—" },
];

export async function generateBudgetPdf(data: BudgetExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      font: "",
      bufferPages: true,
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (!registerFonts(doc)) {
      reject(new Error("PDF_FONTS_UNAVAILABLE"));
      return;
    }

    doc.y = PAGE_MARGIN;
    drawDocumentHeader(doc, data);
    drawInfoSection(doc, data);
    drawSectionTitle(doc, "Podsumowanie budżetu");
    drawSummaryBox(doc, data);
    drawSectionTitle(doc, "Koszty materiałów");
    drawDataTable(doc, COST_PDF_COLUMNS, data.items);
    drawSectionTitle(doc, "Robocizna");
    drawDataTable(doc, LABOR_PDF_COLUMNS, data.laborItems);

    drawFooters(doc, data.exportedAt);
    doc.end();
  });
}
