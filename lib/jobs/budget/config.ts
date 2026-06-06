import { isValidVatRate } from "@/lib/jobs/budget/vat";

export const BUDGET_CATEGORIES = [
  "Materiały",
  "Robocizna",
  "Dojazd",
  "Sprzęt",
  "Usługi zewnętrzne",
  "Podwykonawca",
  "Administracyjne",
  "Inne",
] as const;

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const BUDGET_TAX_CATEGORIES = [
  "Koszt firmowy",
  "Materiał / towar",
  "Usługa obca",
  "Transport / paliwo",
  "Sprzęt / narzędzia",
  "Wynagrodzenie",
  "Inne",
] as const;

export type BudgetTaxCategory = (typeof BUDGET_TAX_CATEGORIES)[number];

export const BUDGET_VAT_RATES = [
  "23%",
  "8%",
  "5%",
  "0%",
  "zw.",
  "nie dotyczy",
] as const;

export type BudgetVatRate = (typeof BUDGET_VAT_RATES)[number];

export const BUDGET_VAT_CUSTOM = "custom" as const;

export const BUDGET_DOCUMENT_TYPES = [
  "Faktura VAT",
  "Faktura bez VAT",
  "Paragon",
  "Rachunek",
  "Umowa",
  "Inne",
] as const;

/** Legacy document types stored before accounting redesign. */
export const BUDGET_DOCUMENT_TYPES_LEGACY = [
  "Faktura",
  "Brak dokumentu",
  "Nie dotyczy",
] as const;

export type BudgetDocumentType = (typeof BUDGET_DOCUMENT_TYPES)[number];

export type BudgetStatus = "within" | "near_limit" | "exceeded";

export type BudgetUtilizationLevel = "healthy" | "warning" | "critical";

export type ProfitabilityLevel = "high" | "moderate" | "low" | "none";

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  within: "W budżecie",
  near_limit: "Blisko limitu",
  exceeded: "Przekroczony",
};

export const BUDGET_UTILIZATION_THRESHOLDS = {
  warning: 0.8,
  critical: 0.95,
} as const;

export const PROFITABILITY_THRESHOLDS = {
  high: 30,
  moderate: 15,
} as const;

export const PROFITABILITY_LABELS: Record<ProfitabilityLevel, string> = {
  high: "Wysoka rentowność",
  moderate: "Umiarkowana rentowność",
  low: "Niska rentowność",
  none: "Brak danych",
};

export const BUDGET_PAGE_SIZE_DEFAULT = 25;
export const BUDGET_JOBS_PAGE_SIZE_DEFAULT = 50;

export function isBudgetCategory(value: string): value is BudgetCategory {
  return (BUDGET_CATEGORIES as readonly string[]).includes(value);
}

export function isBudgetTaxCategory(value: string): value is BudgetTaxCategory {
  return (BUDGET_TAX_CATEGORIES as readonly string[]).includes(value);
}

export function isBudgetVatRate(value: string): value is BudgetVatRate {
  return (BUDGET_VAT_RATES as readonly string[]).includes(value);
}

export { isValidVatRate };

export function isBudgetDocumentType(value: string): value is BudgetDocumentType {
  return (
    (BUDGET_DOCUMENT_TYPES as readonly string[]).includes(value) ||
    (BUDGET_DOCUMENT_TYPES_LEGACY as readonly string[]).includes(value)
  );
}

export function normalizeDocumentTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const legacyMap: Record<string, string> = {
    Faktura: "Faktura VAT",
    "Brak dokumentu": "Inne",
    "Nie dotyczy": "Inne",
  };
  return legacyMap[value] ?? value;
}

export function getBudgetUtilizationLevel(ratio: number): BudgetUtilizationLevel {
  if (ratio >= BUDGET_UTILIZATION_THRESHOLDS.critical) return "critical";
  if (ratio >= BUDGET_UTILIZATION_THRESHOLDS.warning) return "warning";
  return "healthy";
}

export function getProfitabilityLevel(percent: number | null): ProfitabilityLevel {
  if (percent == null) return "none";
  if (percent >= PROFITABILITY_THRESHOLDS.high) return "high";
  if (percent >= PROFITABILITY_THRESHOLDS.moderate) return "moderate";
  return "low";
}
