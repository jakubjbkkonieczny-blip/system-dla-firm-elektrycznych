import { BUDGET_STATUS_LABELS } from "@/lib/jobs/budget/config";
import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetSummary } from "@/lib/jobs/budget/types";

const BAR_COLORS = {
  healthy: "bg-emerald-500",
  warning: "bg-orange-500",
  critical: "bg-red-500",
} as const;

const BADGE_COLORS = {
  healthy: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-orange-50 text-orange-900 border-orange-200",
  critical: "bg-red-50 text-red-800 border-red-200",
} as const;

export function BudgetHealthCard({ summary }: { summary: JobBudgetSummary }) {
  const percent = summary.budgetUtilizationPercent ?? 0;
  const clamped = Math.min(100, Math.max(0, percent));
  const level = summary.utilizationLevel;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Wykorzystanie budżetu</h3>
          <p className="text-xs text-gray-500 mt-0.5">Monitor stanu finansowego projektu</p>
        </div>
        <span
          className={[
            "inline-flex px-3 py-1 rounded-full border text-xs font-semibold",
            BADGE_COLORS[level],
          ].join(" ")}
        >
          {BUDGET_STATUS_LABELS[summary.status]}
        </span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold text-gray-900">
            {summary.budgetUtilizationPercent != null ? `${clamped.toFixed(1)}%` : "—"}
          </div>
          <div className="text-xs text-gray-500 mt-1">Budżet wykorzystany</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-gray-900">
            {formatPlnFromCents(summary.remainingCents)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Pozostało</div>
        </div>
      </div>

      <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={["h-full rounded-full transition-all", BAR_COLORS[level]].join(" ")}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Wykorzystanie budżetu"
        />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> 0–80% zdrowy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> 80–95% ostrzeżenie
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> 95%+ krytyczny
        </span>
      </div>
    </div>
  );
}
