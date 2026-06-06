import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetSummary } from "@/lib/jobs/budget/types";
import { KPI_CARD_STYLES } from "@/components/budget/constants";

type KpiCardProps = {
  label: string;
  value: string;
  description: string;
  icon: string;
  style: (typeof KPI_CARD_STYLES)[keyof typeof KPI_CARD_STYLES];
};

function KpiCard({ label, value, description, icon, style }: KpiCardProps) {
  return (
    <div
      className={[
        "rounded-xl border p-4 min-w-0 flex flex-col gap-2",
        style.bg,
        style.border,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={["text-xs font-semibold uppercase tracking-wide", style.muted].join(" ")}>
          {label}
        </div>
        <div
          className={[
            "w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm shrink-0",
            style.icon,
          ].join(" ")}
          aria-hidden
        >
          {icon}
        </div>
      </div>
      <div className={["text-xl font-bold break-words", style.text].join(" ")}>{value}</div>
      <div className={["text-xs", style.muted].join(" ")}>{description}</div>
    </div>
  );
}

export function KpiCards({ summary }: { summary: JobBudgetSummary }) {
  const remainingStyle =
    summary.remainingCents < 0 ? KPI_CARD_STYLES.remainingNegative : KPI_CARD_STYLES.remaining;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
      <KpiCard
        label="Budżet projektu"
        value={formatPlnFromCents(summary.totalBudgetCents)}
        description="Ustalona kwota projektu"
        icon="💰"
        style={KPI_CARD_STYLES.budget}
      />
      <KpiCard
        label="Koszty netto"
        value={formatPlnFromCents(summary.plannedCostsNetCents)}
        description="Suma kosztów materiałów netto"
        icon="📋"
        style={KPI_CARD_STYLES.net}
      />
      <KpiCard
        label="VAT / Podatek"
        value={formatPlnFromCents(summary.estimatedTaxCents)}
        description="Szacowany podatek VAT"
        icon="🧾"
        style={KPI_CARD_STYLES.vat}
      />
      <KpiCard
        label="Koszty brutto"
        value={formatPlnFromCents(summary.plannedCostsGrossCents)}
        description="Suma kosztów materiałów brutto"
        icon="📦"
        style={KPI_CARD_STYLES.gross}
      />
      <KpiCard
        label="Robocizna"
        value={formatPlnFromCents(summary.plannedLaborEmployerCents)}
        description="Szacowany koszt zatrudnienia"
        icon="👷"
        style={KPI_CARD_STYLES.labor}
      />
      <KpiCard
        label="Pozostało"
        value={formatPlnFromCents(summary.remainingCents)}
        description={
          summary.remainingCents < 0 ? "Przekroczenie budżetu" : "Wolne środki w budżecie"
        }
        icon={summary.remainingCents < 0 ? "⚠️" : "✅"}
        style={remainingStyle}
      />
    </div>
  );
}
