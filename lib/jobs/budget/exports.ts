import type { BudgetServerExportFormat } from "@/lib/jobs/budget/export-data";

export type BudgetExportFormat = BudgetServerExportFormat;

export const BUDGET_EXPORT_FORMATS: { id: BudgetExportFormat; label: string }[] = [
  { id: "pdf", label: "Eksport PDF" },
  { id: "xlsx", label: "Eksport Excel" },
  { id: "csv", label: "Eksport CSV" },
];

export type BudgetExportMenuContext = {
  companyId: string;
  jobId: string;
  jobNumber: number;
};
