import type { BudgetExportFormat, JobBudgetHeaderPayload } from "@/lib/jobs/budget/types";

export type BudgetExportContext = {
  companyId: string;
  jobId: string;
  jobLabel: string;
  header: JobBudgetHeaderPayload;
};

export type BudgetExportHandler = (ctx: BudgetExportContext) => Promise<void> | void;

const exportHandlers: Partial<Record<BudgetExportFormat, BudgetExportHandler>> = {};

export function registerBudgetExportHandler(
  format: BudgetExportFormat,
  handler: BudgetExportHandler
) {
  exportHandlers[format] = handler;
}

export async function triggerBudgetExport(
  format: BudgetExportFormat,
  ctx: BudgetExportContext
): Promise<{ ok: boolean; message: string }> {
  const handler = exportHandlers[format];
  if (!handler) {
    return {
      ok: false,
      message: `Eksport ${format.toUpperCase()} — w przygotowaniu. Architektura gotowa.`,
    };
  }
  await handler(ctx);
  return { ok: true, message: `Eksport ${format.toUpperCase()} zakończony.` };
}

export const BUDGET_EXPORT_FORMATS: { id: BudgetExportFormat; label: string }[] = [
  { id: "pdf", label: "Eksport PDF" },
  { id: "excel", label: "Eksport Excel" },
  { id: "csv", label: "Eksport CSV" },
];
