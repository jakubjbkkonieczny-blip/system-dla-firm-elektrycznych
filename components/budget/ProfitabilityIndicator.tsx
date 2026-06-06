import { PROFITABILITY_LABELS } from "@/lib/jobs/budget/config";
import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetSummary } from "@/lib/jobs/budget/types";

const LEVEL_STYLES = {
  high: "bg-emerald-50 text-emerald-800 border-emerald-200",
  moderate: "bg-amber-50 text-amber-900 border-amber-200",
  low: "bg-red-50 text-red-800 border-red-200",
  none: "bg-gray-50 text-gray-600 border-gray-200",
} as const;

export function ProfitabilityIndicator({ summary }: { summary: JobBudgetSummary }) {
  const level = summary.profitabilityLevel;
  const percentLabel =
    summary.profitabilityPercent != null
      ? `${summary.profitabilityPercent.toFixed(1)}%`
      : "—";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Rentowność projektu</h3>
          <p className="text-xs text-gray-500 mt-0.5">
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
          <div className="text-2xl font-bold text-gray-900">{percentLabel}</div>
          <div className="text-xs text-gray-500">Marża %</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {formatPlnFromCents(summary.profitCents)}
          </div>
          <div className="text-xs text-gray-500">Szacowana marża</div>
        </div>
      </div>
    </div>
  );
}
