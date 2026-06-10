"use client";

import { ProfitabilityIndicator } from "@/components/budget/ProfitabilityIndicator";
import { PROFITABILITY_LABELS } from "@/lib/jobs/budget/config";
import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetSummary } from "@/lib/jobs/budget/types";

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={["flex justify-between gap-4 py-3 border-b border-border", highlight ? "font-semibold" : ""].join(" ")}>
      <span className="text-text-muted">{label}</span>
      <span className="text-text text-right">{value}</span>
    </div>
  );
}

export function SummaryTab({ summary }: { summary: JobBudgetSummary }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">Podsumowanie księgowe projektu z wskaźnikami rentowności.</p>

      <ProfitabilityIndicator summary={summary} />

      <div className="rounded-xl border border-border theme-glass bg-card p-4">
        <h4 className="text-sm font-semibold text-text mb-2">Zestawienie kosztów</h4>
        <SummaryRow label="Koszty netto (materiały)" value={formatPlnFromCents(summary.plannedCostsNetCents)} />
        <SummaryRow label="VAT / podatek" value={formatPlnFromCents(summary.estimatedTaxCents)} />
        <SummaryRow label="Koszty brutto (materiały)" value={formatPlnFromCents(summary.plannedCostsGrossCents)} />
        <SummaryRow label="Koszty do odliczenia" value={formatPlnFromCents(summary.deductibleCostsCents)} />
        <SummaryRow label="Robocizna (podstawowa)" value={formatPlnFromCents(summary.plannedLaborBaseCents)} />
        <SummaryRow label="Szacowany koszt zatrudnienia" value={formatPlnFromCents(summary.plannedLaborEmployerCents)} />
        <SummaryRow label="Suma planowanych kosztów" value={formatPlnFromCents(summary.totalPlannedCents)} highlight />
        <SummaryRow label="Budżet projektu" value={formatPlnFromCents(summary.totalBudgetCents)} />
        <SummaryRow
          label="Pozostały budżet"
          value={formatPlnFromCents(summary.remainingCents)}
          highlight
        />
        <SummaryRow
          label="Szacowana marża"
          value={formatPlnFromCents(summary.profitCents)}
          highlight
        />
        <SummaryRow
          label="Rentowność"
          value={
            summary.profitabilityPercent != null
              ? `${summary.profitabilityPercent.toFixed(1)}% — ${PROFITABILITY_LABELS[summary.profitabilityLevel]}`
              : "—"
          }
          highlight
        />
      </div>
    </div>
  );
}
