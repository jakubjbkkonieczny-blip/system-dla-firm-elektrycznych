import {
  getBudgetUtilizationLevel,
  getProfitabilityLevel,
  BUDGET_UTILIZATION_THRESHOLDS,
  type BudgetStatus,
  type BudgetUtilizationLevel,
  type ProfitabilityLevel,
} from "@/lib/jobs/budget/config";
import { itemTaxCents } from "@/lib/jobs/budget/money";
import { computeLaborCost } from "@/lib/jobs/budget/labor-cost-engine";
import type { EmploymentType } from "@/lib/jobs/budget/employment-type";

export type BudgetItemCalcInput = {
  grossAmountCents: number;
  netAmountCents: number | null;
  deductible: boolean;
};

export type BudgetLaborCalcInput = {
  plannedMinutes: number;
  hourlyRateCents: number;
  employmentType: EmploymentType;
};

export type BudgetSummary = {
  totalBudgetCents: number;
  plannedCostsNetCents: number;
  plannedCostsGrossCents: number;
  plannedCostsCents: number;
  plannedLaborBaseCents: number;
  plannedLaborEmployerCents: number;
  plannedLaborCents: number;
  totalPlannedCents: number;
  estimatedTaxCents: number;
  deductibleCostsCents: number;
  remainingCents: number;
  status: BudgetStatus;
  budgetUtilizationPercent: number | null;
  utilizationLevel: BudgetUtilizationLevel;
  profitCents: number;
  profitabilityPercent: number | null;
  profitabilityLevel: ProfitabilityLevel;
};

export function computeBudgetSummary(args: {
  totalBudgetCents: number;
  items: BudgetItemCalcInput[];
  laborItems: BudgetLaborCalcInput[];
}): BudgetSummary {
  const plannedCostsGrossCents = args.items.reduce((sum, item) => sum + item.grossAmountCents, 0);
  const plannedCostsNetCents = args.items.reduce(
    (sum, item) => sum + (item.netAmountCents ?? item.grossAmountCents),
    0
  );
  const estimatedTaxCents = args.items.reduce(
    (sum, item) => sum + itemTaxCents(item.netAmountCents, item.grossAmountCents),
    0
  );
  const deductibleCostsCents = args.items
    .filter((i) => i.deductible)
    .reduce((sum, item) => sum + item.grossAmountCents, 0);

  let plannedLaborBaseCents = 0;
  let plannedLaborEmployerCents = 0;
  for (const item of args.laborItems) {
    const result = computeLaborCost({
      plannedMinutes: item.plannedMinutes,
      hourlyRateCents: item.hourlyRateCents,
      employmentType: item.employmentType,
    });
    plannedLaborBaseCents += result.baseLaborCostCents;
    plannedLaborEmployerCents += result.employerLaborCostCents;
  }

  const totalPlannedCents = plannedCostsGrossCents + plannedLaborEmployerCents;
  const remainingCents = args.totalBudgetCents - totalPlannedCents;
  const profitCents =
    args.totalBudgetCents - plannedCostsGrossCents - plannedLaborEmployerCents;

  const budgetUtilizationPercent =
    args.totalBudgetCents > 0
      ? Math.round((totalPlannedCents / args.totalBudgetCents) * 10000) / 100
      : null;

  const utilizationRatio =
    args.totalBudgetCents > 0 ? totalPlannedCents / args.totalBudgetCents : 0;
  const utilizationLevel = getBudgetUtilizationLevel(utilizationRatio);

  const profitabilityPercent =
    args.totalBudgetCents > 0
      ? Math.round((profitCents / args.totalBudgetCents) * 10000) / 100
      : null;
  const profitabilityLevel = getProfitabilityLevel(profitabilityPercent);

  let status: BudgetStatus = "within";
  if (remainingCents < 0) {
    status = "exceeded";
  } else if (args.totalBudgetCents > 0) {
    if (utilizationRatio >= BUDGET_UTILIZATION_THRESHOLDS.critical) {
      status = "near_limit";
    } else if (utilizationRatio >= BUDGET_UTILIZATION_THRESHOLDS.warning) {
      status = "near_limit";
    }
  }

  return {
    totalBudgetCents: args.totalBudgetCents,
    plannedCostsNetCents,
    plannedCostsGrossCents,
    plannedCostsCents: plannedCostsGrossCents,
    plannedLaborBaseCents,
    plannedLaborEmployerCents,
    plannedLaborCents: plannedLaborEmployerCents,
    totalPlannedCents,
    estimatedTaxCents,
    deductibleCostsCents,
    remainingCents,
    status,
    budgetUtilizationPercent,
    utilizationLevel,
    profitCents,
    profitabilityPercent,
    profitabilityLevel,
  };
}
