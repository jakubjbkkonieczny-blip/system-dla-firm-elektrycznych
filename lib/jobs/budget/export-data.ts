import {
  BUDGET_STATUS_LABELS,
  PROFITABILITY_LABELS,
  normalizeDocumentTypeLabel,
} from "@/lib/jobs/budget/config";
import { formatPlnFromCents, minutesToHoursLabel } from "@/lib/jobs/budget/money";
import type {
  JobBudgetDto,
  JobBudgetItemDto,
  JobBudgetLaborItemDto,
  JobBudgetSummary,
} from "@/lib/jobs/budget/types";

export const BUDGET_EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type BudgetServerExportFormat = (typeof BUDGET_EXPORT_FORMATS)[number];

export type BudgetExportJobInfo = {
  id: string;
  jobNumber: number;
  customerName: string;
  addressCity: string;
  addressStreet: string;
  status: string;
};

export type BudgetExportData = {
  companyName: string;
  job: BudgetExportJobInfo;
  exportedAt: string;
  budget: JobBudgetDto;
  items: JobBudgetItemDto[];
  laborItems: JobBudgetLaborItemDto[];
  summary: JobBudgetSummary;
};

export function parseBudgetExportFormat(raw: string | null): BudgetServerExportFormat | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "excel") return "xlsx";
  if ((BUDGET_EXPORT_FORMATS as readonly string[]).includes(value)) {
    return value as BudgetServerExportFormat;
  }
  return null;
}

export function buildBudgetExportFilename(
  jobNumber: number,
  jobId: string,
  extension: string
): string {
  const slug = Number.isFinite(jobNumber) ? String(jobNumber) : jobId.slice(0, 8);
  return `kosztorys-${slug}.${extension}`;
}

export function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function formatExportYesNo(value: boolean): string {
  return value ? "Tak" : "Nie";
}

export function formatExportPercent(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

export function buildSummaryRows(data: BudgetExportData): [string, string][] {
  const { job, summary, budget } = data;
  return [
    ["Firma", data.companyName],
    ["Numer zlecenia", `#${job.jobNumber}`],
    ["Klient", job.customerName],
    ["Miasto", job.addressCity],
    ["Ulica", job.addressStreet],
    ["Status zlecenia", job.status],
    ["Data eksportu", formatExportDate(data.exportedAt)],
    ["Budżet projektu", formatPlnFromCents(summary.totalBudgetCents)],
    ["Koszty netto", formatPlnFromCents(summary.plannedCostsNetCents)],
    ["VAT / podatek", formatPlnFromCents(summary.estimatedTaxCents)],
    ["Koszty brutto", formatPlnFromCents(summary.plannedCostsGrossCents)],
    ["Koszty do odliczenia", formatPlnFromCents(summary.deductibleCostsCents)],
    ["Robocizna (podst.)", formatPlnFromCents(summary.plannedLaborBaseCents)],
    ["Szac. koszt zatrudnienia", formatPlnFromCents(summary.plannedLaborEmployerCents)],
    ["Suma planowanych kosztów", formatPlnFromCents(summary.totalPlannedCents)],
    ["Pozostały budżet", formatPlnFromCents(summary.remainingCents)],
    ["Wykorzystanie budżetu", formatExportPercent(summary.budgetUtilizationPercent)],
    ["Status budżetu", BUDGET_STATUS_LABELS[summary.status]],
    ["Szacowana marża", formatPlnFromCents(summary.profitCents)],
    ["Rentowność", formatExportPercent(summary.profitabilityPercent)],
    ["Poziom rentowności", PROFITABILITY_LABELS[summary.profitabilityLevel]],
    ["Notatka", budget.note ?? ""],
  ];
}

export function itemDocumentLabel(item: JobBudgetItemDto): string {
  return normalizeDocumentTypeLabel(item.documentType);
}

export function laborHoursLabel(item: JobBudgetLaborItemDto): string {
  return minutesToHoursLabel(item.plannedMinutes);
}

export const COST_EXPORT_HEADERS = [
  "Nazwa",
  "Kategoria",
  "Kategoria podatkowa",
  "Typ dokumentu",
  "Nr dokumentu",
  "Dostawca",
  "Netto",
  "VAT",
  "Brutto",
  "Stawka VAT",
  "Do odliczenia",
  "Data",
  "Notatka",
] as const;

export const LABOR_EXPORT_HEADERS = [
  "Pracownik",
  "Typ współpracy",
  "Stawka/h",
  "Godziny",
  "Koszt podstawowy",
  "Szac. koszt zatrudnienia",
  "Data",
  "Notatka",
] as const;

export const DOCUMENT_EXPORT_HEADERS = [
  "Typ dokumentu",
  "Nr dokumentu",
  "Dostawca",
  "Nazwa pozycji",
  "Netto",
  "VAT",
  "Brutto",
  "Data",
  "Do odliczenia",
] as const;

export function mapCostExportRow(item: JobBudgetItemDto): string[] {
  return [
    item.name,
    item.category,
    item.taxCategory,
    itemDocumentLabel(item),
    item.documentNumber ?? "",
    item.supplier ?? "",
    formatPlnFromCents(item.netAmountCents ?? item.grossAmountCents),
    formatPlnFromCents(item.taxAmountCents),
    formatPlnFromCents(item.grossAmountCents),
    item.vatRate ?? "",
    formatExportYesNo(item.deductible),
    formatExportDate(item.plannedDate),
    item.note ?? "",
  ];
}

export function mapLaborExportRow(item: JobBudgetLaborItemDto): string[] {
  return [
    item.userLabel ?? "",
    item.employmentTypeLabel,
    formatPlnFromCents(item.hourlyRateCents),
    laborHoursLabel(item),
    formatPlnFromCents(item.baseLaborCostCents),
    formatPlnFromCents(item.employerLaborCostCents),
    formatExportDate(item.plannedDate),
    item.note ?? "",
  ];
}

export function mapDocumentExportRow(item: JobBudgetItemDto): string[] {
  return [
    itemDocumentLabel(item),
    item.documentNumber ?? "",
    item.supplier ?? "",
    item.name,
    formatPlnFromCents(item.netAmountCents ?? item.grossAmountCents),
    formatPlnFromCents(item.taxAmountCents),
    formatPlnFromCents(item.grossAmountCents),
    formatExportDate(item.plannedDate),
    formatExportYesNo(item.deductible),
  ];
}

export function documentExportItems(items: JobBudgetItemDto[]): JobBudgetItemDto[] {
  return items.filter((item) => item.documentType || item.documentNumber || item.supplier);
}
