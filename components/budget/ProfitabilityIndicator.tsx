import { PROFITABILITY_LABELS } from "@/lib/jobs/budget/config";
import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetSummary } from "@/lib/jobs/budget/types";

const LEVEL_STYLES = {
  high: "bg-success-bg text-success border-success-border",
  moderate: "bg-warning-bg text-warning border-warning-border",
  low: "bg-danger-bg text-danger border-danger-border",
  none: "bg-bg-secondary text-text-muted border-border",
} as const;

export function ProfitabilityIndicator({ summary }: { summary: JobBudgetSummary }) {
  const level = summary.profitabilityLevel;
  const percentLabel =
    summary.profitabilityPercent != null
      ? `${summary.profitabilityPercent.toFixed(1)}%`
      : "—";

  return (
    <div className="rounded-xl border border-border theme-glass bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Rentowność projektu</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Budżet − koszty brutto − koszty zatrudnienia
          </p>
        </div>
        <span
          className={[
            "inline-flex px-3 py-1 rounded-full border text-xs font-semibold",
            LEVEL_STYLES[level],
          ].join(" ")}
        >
          {PROFITABILITY_LABELS[level]}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <div>
          <div className="text-2xl font-bold text-text">{percentLabel}</div>
          <div className="text-xs text-text-muted">Marża %</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-text">
            {formatPlnFromCents(summary.profitCents)}
          </div>
          <div className="text-xs text-text-muted">Szacowana marża</div>
        </div>
      </div>
    </div>
  );
}
