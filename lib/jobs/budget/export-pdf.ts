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
} from "@/lib/jobs/budget/export-data";
import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetItemDto, JobBudgetLaborItemDto } from "@/lib/jobs/budget/types";

// Load PDFKit from node_modules (not Turbopack bundle) so __dirname resolves to real AFM data paths.
type PDFKitConstructor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
const PDFDocument = createRequire(path.join(process.cwd(), "package.json"))("pdfkit") as PDFKitConstructor;

/** Single branding source — change here for Elektra → VectorWork rebrand. */
const PDF_BRANDING = {
  appName: "Elektra",
  tagline: "Profesjonalne kosztorysy dla branży technicznej",
  documentTitle: "Kosztorys",
  colors: {
    primary: "#D97706",
    primaryDark: "#B45309",
    primaryLight: "#FEF3C7",
    slate900: "#0F172A",
    slate700: "#334155",
    slate500: "#64748B",
    slate200: "#E2E8F0",
    slate50: "#F8FAFC",
    white: "#FFFFFF",
  },
} as const;

const COLORS = PDF_BRANDING.colors;
const PAGE_MARGIN = 40;
const FOOTER_HEIGHT = 28;
const FONT_REGULAR = "DejaVuSans";
const FONT_BOLD = "DejaVuSans-Bold";
const TABLE_FONT_SIZE = 7;
const TABLE_CELL_PADDING = 5;

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
    return path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", fileName);
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

function formatExportDateShort(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
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

function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

/**
 * Builds job deep-link for QR placeholder.
 * TODO(qr): companyId is not in BudgetExportData — extend export payload to emit
 * `/companies/{companyId}/jobs/{jobId}` for canonical QR targets.
 */
function resolveJobDeepLink(jobId: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL;
  if (!base?.trim()) return null;
  return `${base.replace(/\/$/, "")}/jobs/${jobId}`;
}

function ensureSpace(doc: PdfDoc, height: number) {
  if (doc.y + height > contentBottom(doc)) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  }
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

function drawBrandMark(doc: PdfDoc, x: number, y: number, size: number) {
  doc.save();
  doc.roundedRect(x, y, size, size, 8).fill(COLORS.primary);
  drawLightningBolt(doc, x + 7, y + 7, size - 14);
  doc.restore();
  resetInk(doc);
}

/** QR placeholder — no qrcode library in project yet. */
function drawQrPlaceholder(doc: PdfDoc, x: number, y: number, size: number, targetUrl: string | null) {
  doc.roundedRect(x, y, size, size, 4).lineWidth(0.75).stroke(COLORS.slate200);
  doc
    .font(FONT_REGULAR)
    .fontSize(6)
    .fillColor(COLORS.slate500)
    .text(targetUrl ? "QR" : "QR", x, y + size / 2 - 8, { width: size, align: "center", lineBreak: false });
  if (!targetUrl) {
    doc.fontSize(5).text("(URL niedostępny)", x, y + size / 2 + 2, { width: size, align: "center" });
  }
  // TODO(qr): render QR image when a server-side qrcode dependency is approved.
  resetInk(doc);
}

function drawDocumentHeader(doc: PdfDoc, data: BudgetExportData) {
  const width = contentWidth(doc);
  const top = PAGE_MARGIN;
  const qrSize = 52;
  const qrX = PAGE_MARGIN + width - qrSize;

  drawBrandMark(doc, PAGE_MARGIN, top, 40);
  doc
    .font(FONT_BOLD)
    .fontSize(17)
    .fillColor(COLORS.slate900)
    .text(PDF_BRANDING.appName, PAGE_MARGIN + 50, top + 4, { lineBreak: false });
  doc
    .font(FONT_REGULAR)
    .fontSize(7.5)
    .fillColor(COLORS.slate500)
    .text(PDF_BRANDING.tagline, PAGE_MARGIN + 50, top + 24, { width: width - qrSize - 60, lineBreak: false });

  drawQrPlaceholder(doc, qrX, top, qrSize, resolveJobDeepLink(data.job.id));

  const titleY = top + 54;
  doc.roundedRect(PAGE_MARGIN, titleY, width, 48, 6).fillAndStroke(COLORS.primaryLight, COLORS.primary);

  doc
    .font(FONT_BOLD)
    .fontSize(19)
    .fillColor(COLORS.primaryDark)
    .text(PDF_BRANDING.documentTitle, PAGE_MARGIN + 14, titleY + 8, { width: width * 0.55 });

  doc
    .font(FONT_REGULAR)
    .fontSize(8)
    .fillColor(COLORS.slate500)
    .text(`Nr zlecenia: #${data.job.jobNumber}`, PAGE_MARGIN + width * 0.58, titleY + 10, {
      width: width * 0.38,
      align: "right",
    });
  doc
    .font(FONT_REGULAR)
    .fontSize(8)
    .fillColor(COLORS.slate500)
    .text(`Wygenerowano: ${formatExportDateTime(data.exportedAt)}`, PAGE_MARGIN + width * 0.58, titleY + 22, {
      width: width * 0.38,
      align: "right",
    });
  doc
    .font(FONT_BOLD)
    .fontSize(8)
    .fillColor(COLORS.slate700)
    .text(`Status: ${formatJobStatus(data.job.status)}`, PAGE_MARGIN + width * 0.58, titleY + 34, {
      width: width * 0.38,
      align: "right",
    });

  doc.y = titleY + 56;
  resetInk(doc);
}

function drawInfoPair(
  doc: PdfDoc,
  x: number,
  y: number,
  colW: number,
  label: string,
  value: string
) {
  doc.font(FONT_REGULAR).fontSize(7).fillColor(COLORS.slate500).text(label, x, y, { width: colW });
  doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.slate900).text(value, x, y + 10, { width: colW, lineGap: 1 });
}

function drawClientSection(doc: PdfDoc, data: BudgetExportData) {
  const width = contentWidth(doc);
  const boxH = 96;
  ensureSpace(doc, boxH + 12);

  const y = doc.y + 4;
  doc.roundedRect(PAGE_MARGIN, y, width, boxH, 6).fillAndStroke(COLORS.slate50, COLORS.slate200);

  const colW = (width - 36) / 2;
  const leftX = PAGE_MARGIN + 14;
  const rightX = leftX + colW + 8;

  drawInfoPair(doc, leftX, y + 12, colW, "Klient", displayText(data.job.customerName));
  drawInfoPair(doc, rightX, y + 12, colW, "Wykonawca", displayText(data.companyName));
  drawInfoPair(doc, leftX, y + 38, colW, "Ulica", displayText(data.job.addressStreet));
  drawInfoPair(doc, rightX, y + 38, colW, "Miasto", displayText(data.job.addressCity));
  drawInfoPair(doc, leftX, y + 64, colW, "Numer zlecenia", `#${data.job.jobNumber}`);
  drawInfoPair(doc, rightX, y + 64, colW, "Status zlecenia", formatJobStatus(data.job.status));

  doc.y = y + boxH + 14;
  resetInk(doc);
}

function drawSectionTitle(doc: PdfDoc, title: string) {
  ensureSpace(doc, 32);
  const width = contentWidth(doc);
  const y = doc.y + 4;

  doc.rect(PAGE_MARGIN, y, 4, 16).fill(COLORS.primary);
  doc.font(FONT_BOLD).fontSize(12).fillColor(COLORS.slate900).text(title, PAGE_MARGIN + 10, y, {
    width: width - 10,
  });
  doc.y = y + 24;
  resetInk(doc);
}

function drawSummaryBox(doc: PdfDoc, data: BudgetExportData) {
  const { summary } = data;
  const width = contentWidth(doc);
  const metrics: { label: string; value: string; highlight?: boolean }[] = [
    { label: "Budżet projektu", value: formatPlnFromCents(summary.totalBudgetCents), highlight: true },
    { label: "Koszty netto", value: formatPlnFromCents(summary.plannedCostsNetCents) },
    { label: "VAT / podatek", value: formatPlnFromCents(summary.estimatedTaxCents) },
    { label: "Koszty brutto", value: formatPlnFromCents(summary.plannedCostsGrossCents) },
    { label: "Wykorzystanie budżetu", value: formatExportPercent(summary.budgetUtilizationPercent) },
    { label: "Pozostały budżet", value: formatPlnFromCents(summary.remainingCents), highlight: true },
    { label: "Rentowność", value: formatExportPercent(summary.profitabilityPercent) },
    { label: "Szacowana marża", value: formatPlnFromCents(summary.profitCents), highlight: true },
    { label: "Status budżetu", value: BUDGET_STATUS_LABELS[summary.status] },
  ];

  const cols = 3;
  const gap = 8;
  const cellW = (width - 24 - gap * (cols - 1)) / cols;
  const cellH = 40;
  const rows = Math.ceil(metrics.length / cols);
  const boxH = 16 + rows * (cellH + 6);

  ensureSpace(doc, boxH + 8);
  const y = doc.y;
  doc.roundedRect(PAGE_MARGIN, y, width, boxH, 6).fillAndStroke(COLORS.white, COLORS.slate200);

  metrics.forEach((metric, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cellX = PAGE_MARGIN + 12 + col * (cellW + gap);
    const cellY = y + 12 + row * (cellH + 6);

    if (metric.highlight) {
      doc.roundedRect(cellX, cellY, cellW, cellH, 4).fill(COLORS.primaryLight);
    }

    doc.font(FONT_REGULAR).fontSize(6.5).fillColor(COLORS.slate500).text(metric.label, cellX + 7, cellY + 7, {
      width: cellW - 14,
    });
    doc
      .font(metric.highlight ? FONT_BOLD : FONT_REGULAR)
      .fontSize(metric.highlight ? 10.5 : 9)
      .fillColor(metric.highlight ? COLORS.primaryDark : COLORS.slate900)
      .text(metric.value, cellX + 7, cellY + 18, { width: cellW - 14 });
  });

  doc.y = y + boxH + 12;
  resetInk(doc);
}

function columnWidths(doc: PdfDoc, columns: TableColumn<unknown>[]): number[] {
  const total = contentWidth(doc);
  return columns.map((col) => col.fraction * total);
}

function measureCellHeight(
  doc: PdfDoc,
  text: string,
  width: number,
  fontSize: number,
  padding: number
): number {
  doc.font(FONT_REGULAR).fontSize(fontSize);
  const inner = Math.max(8, width - padding * 2);
  return doc.heightOfString(displayText(text), { width: inner, lineGap: 1 }) + padding * 2;
}

function measureHeaderHeight(
  doc: PdfDoc,
  columns: TableColumn<unknown>[],
  widths: number[],
  fontSize: number,
  padding: number
): number {
  let maxH = fontSize + padding * 2;
  columns.forEach((col, i) => {
    doc.font(FONT_BOLD).fontSize(fontSize);
    const h = doc.heightOfString(col.header, { width: widths[i] - padding * 2, lineGap: 0 });
    maxH = Math.max(maxH, h + padding * 2 + 2);
  });
  return maxH;
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
    const text = col.value(row as never);
    maxH = Math.max(maxH, measureCellHeight(doc, text, widths[i], fontSize, padding));
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
  const headerH = measureHeaderHeight(doc, columns, widths, fontSize, padding);
  const y = doc.y;
  const totalW = widths.reduce((a, b) => a + b, 0);

  doc.rect(PAGE_MARGIN, y, totalW, headerH).fill(COLORS.slate900);

  let x = PAGE_MARGIN;
  columns.forEach((col, i) => {
    doc
      .font(FONT_BOLD)
      .fontSize(fontSize)
      .fillColor(COLORS.white)
      .text(col.header, x + padding, y + padding, {
        width: widths[i] - padding * 2,
        align: col.align ?? "left",
        lineGap: 0,
      });
    x += widths[i];
  });

  doc.y = y + headerH;
  resetInk(doc);
  return headerH;
}

function drawDataTable<T>(doc: PdfDoc, columns: TableColumn<T>[], rows: T[]) {
  if (rows.length === 0) {
    ensureSpace(doc, 20);
    doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.slate500).text("Brak pozycji.", PAGE_MARGIN, doc.y, {
      width: contentWidth(doc),
    });
    doc.y += 18;
    return;
  }

  const fontSize = TABLE_FONT_SIZE;
  const padding = TABLE_CELL_PADDING;
  const widths = columnWidths(doc, columns as TableColumn<unknown>[]);
  const totalW = widths.reduce((a, b) => a + b, 0);
  const headerFn = () => drawTableHeader(doc, columns as TableColumn<unknown>[], widths, fontSize, padding);

  headerFn();

  rows.forEach((row, rowIndex) => {
    const rowH = measureRowHeight(doc, columns as TableColumn<unknown>[], widths, row, fontSize, padding);
    if (doc.y + rowH > contentBottom(doc)) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
      headerFn();
    }

    const y = doc.y;
    const fill = rowIndex % 2 === 0 ? COLORS.white : COLORS.slate50;
    doc.rect(PAGE_MARGIN, y, totalW, rowH).fill(fill);
    doc.rect(PAGE_MARGIN, y, totalW, rowH).lineWidth(0.5).stroke(COLORS.slate200);

    let x = PAGE_MARGIN;
    columns.forEach((col, i) => {
      if (i > 0) {
        doc.moveTo(x, y).lineTo(x, y + rowH).lineWidth(0.5).stroke(COLORS.slate200);
      }
      const innerW = widths[i] - padding * 2;
      doc
        .font(FONT_REGULAR)
        .fontSize(fontSize)
        .fillColor(COLORS.slate700)
        .text(displayText(col.value(row)), x + padding, y + padding, {
          width: innerW,
          height: rowH - padding * 2,
          align: col.align ?? "left",
          lineGap: 1,
        });
      x += widths[i];
    });

    doc.y = y + rowH;
    resetInk(doc);
  });

  doc.y += 8;
}

function collectNotes(data: BudgetExportData): string[] {
  const notes: string[] = [];
  const budgetNote = data.budget.note?.trim();
  if (budgetNote) notes.push(`Kosztorys: ${budgetNote}`);

  for (const item of data.items) {
    const note = item.note?.trim();
    if (note) notes.push(`Materiał „${item.name}”: ${note}`);
  }

  for (const item of data.laborItems) {
    const note = item.note?.trim();
    if (note) notes.push(`Robocizna „${displayText(item.userLabel)}”: ${note}`);
  }

  return notes;
}

function drawNotesSection(doc: PdfDoc, data: BudgetExportData) {
  drawSectionTitle(doc, "Notatki");
  const notes = collectNotes(data);
  const width = contentWidth(doc);

  if (notes.length === 0) {
    ensureSpace(doc, 20);
    doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.slate500).text("Brak notatek.", PAGE_MARGIN, doc.y, {
      width,
    });
    doc.y += 18;
    return;
  }

  for (const note of notes) {
    doc.font(FONT_REGULAR).fontSize(8);
    const h = doc.heightOfString(`• ${note}`, { width: width - 8, lineGap: 2 });
    ensureSpace(doc, h + 6);
    doc.fillColor(COLORS.slate700).text(`• ${note}`, PAGE_MARGIN + 4, doc.y, { width: width - 8, lineGap: 2 });
    doc.y += 4;
  }

  doc.y += 6;
  resetInk(doc);
}

function drawFooters(doc: PdfDoc, exportedAt: string) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const width = contentWidth(doc);
  const footerY = doc.page.height - PAGE_MARGIN + 4;
  const dateLabel = formatExportDateShort(exportedAt);
  const footerText = (page: number) =>
    `${PDF_BRANDING.appName} | Strona ${page} z ${total} | ${dateLabel}`;

  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    doc
      .moveTo(PAGE_MARGIN, footerY - 6)
      .lineTo(PAGE_MARGIN + width, footerY - 6)
      .lineWidth(0.5)
      .stroke(COLORS.slate200);
    doc
      .font(FONT_REGULAR)
      .fontSize(7)
      .fillColor(COLORS.slate500)
      .text(footerText(i + 1), PAGE_MARGIN, footerY, { width, align: "center", lineBreak: false });
  }

  resetInk(doc);
}

const COST_PDF_COLUMNS: TableColumn<JobBudgetItemDto>[] = [
  { header: "Nazwa", fraction: 0.17, value: (r) => r.name },
  { header: "Dokument", fraction: 0.1, value: (r) => itemDocumentLabel(r) },
  { header: "Dostawca", fraction: 0.11, value: (r) => r.supplier ?? "" },
  { header: "Kategoria", fraction: 0.1, value: (r) => r.category },
  { header: "Netto", fraction: 0.1, align: "right", value: (r) => formatPlnFromCents(r.netAmountCents ?? r.grossAmountCents) },
  { header: "VAT", fraction: 0.09, align: "right", value: (r) => formatPlnFromCents(r.taxAmountCents) },
  { header: "Brutto", fraction: 0.1, align: "right", value: (r) => formatPlnFromCents(r.grossAmountCents) },
  { header: "Data", fraction: 0.08, align: "center", value: (r) => formatExportDate(r.plannedDate) },
  { header: "Odlicz.", fraction: 0.07, align: "center", value: (r) => formatExportYesNo(r.deductible) },
  { header: "Notatka", fraction: 0.08, value: (r) => r.note ?? "" },
];

const LABOR_PDF_COLUMNS: TableColumn<JobBudgetLaborItemDto>[] = [
  { header: "Pracownik", fraction: 0.16, value: (r) => r.userLabel ?? "" },
  { header: "Typ współpracy", fraction: 0.13, value: (r) => r.employmentTypeLabel },
  { header: "Stawka/h", fraction: 0.1, align: "right", value: (r) => formatPlnFromCents(r.hourlyRateCents) },
  { header: "Godziny", fraction: 0.09, align: "right", value: (r) => laborHoursLabel(r) },
  { header: "Koszt podst.", fraction: 0.13, align: "right", value: (r) => formatPlnFromCents(r.baseLaborCostCents) },
  { header: "Koszt zatr.", fraction: 0.13, align: "right", value: (r) => formatPlnFromCents(r.employerLaborCostCents) },
  { header: "Data", fraction: 0.09, align: "center", value: (r) => formatExportDate(r.plannedDate) },
  { header: "Notatka", fraction: 0.17, value: (r) => r.note ?? "" },
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
    drawClientSection(doc, data);
    drawSectionTitle(doc, "Podsumowanie budżetu");
    drawSummaryBox(doc, data);
    drawSectionTitle(doc, "Koszty materiałów");
    drawDataTable(doc, COST_PDF_COLUMNS, data.items);
    drawSectionTitle(doc, "Robocizna");
    drawDataTable(doc, LABOR_PDF_COLUMNS, data.laborItems);
    drawNotesSection(doc, data);

    drawFooters(doc, data.exportedAt);
    doc.end();
  });
}
