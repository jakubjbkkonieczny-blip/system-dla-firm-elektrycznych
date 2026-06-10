import { BUDGET_STATUS_LABELS } from "@/lib/jobs/budget/config";
import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetSummary } from "@/lib/jobs/budget/types";

const BAR_COLORS = {
  healthy: "bg-success",
  warning: "bg-warning",
  critical: "bg-danger",
} as const;

const BADGE_COLORS = {
  healthy: "bg-success-bg text-success border-success-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  critical: "bg-danger-bg text-danger border-danger-border",
} as const;

export function BudgetHealthCard({ summary }: { summary: JobBudgetSummary }) {
  const percent = summary.budgetUtilizationPercent ?? 0;
  const clamped = Math.min(100, Math.max(0, percent));
  const level = summary.utilizationLevel;

  return (
    <div className="rounded-xl border border-border theme-glass bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Wykorzystanie budżetu</h3>
          <p className="text-xs text-text-muted mt-0.5">Monitor stanu finansowego projektu</p>
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
          <div className="text-3xl font-bold text-text">
            {summary.budgetUtilizationPercent != null ? `${clamped.toFixed(1)}%` : "—"}
          </div>
          <div className="text-xs text-text-muted mt-1">Budżet wykorzystany</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-text">
            {formatPlnFromCents(summary.remainingCents)}
          </div>
          <div className="text-xs text-text-muted mt-1">Pozostało</div>
        </div>
      </div>

      <div className="h-3 rounded-full bg-bg-secondary overflow-hidden">
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

      <div className="flex flex-wrap gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success" /> 0–80% zdrowy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning" /> 80–95% ostrzeżenie
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-danger" /> 95%+ krytyczny
        </span>
      </div>
    </div>
  );
}
