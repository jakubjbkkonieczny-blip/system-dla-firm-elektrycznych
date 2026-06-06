import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBudgetSummary } from "@/lib/jobs/budget/calculations";

describe("computeBudgetSummary", () => {
  it("calculates VAT and gross totals from items", () => {
    const summary = computeBudgetSummary({
      totalBudgetCents: 100_000_00,
      items: [
        { grossAmountCents: 12_300, netAmountCents: 10_000, deductible: true },
        { grossAmountCents: 5_400, netAmountCents: 5_000, deductible: false },
      ],
      laborItems: [],
    });

    assert.equal(summary.plannedCostsGrossCents, 17_700);
    assert.equal(summary.plannedCostsNetCents, 15_000);
    assert.equal(summary.estimatedTaxCents, 2_700);
    assert.equal(summary.deductibleCostsCents, 12_300);
  });

  it("calculates employment costs with multipliers", () => {
    const summary = computeBudgetSummary({
      totalBudgetCents: 50_000_00,
      items: [],
      laborItems: [
        {
          plannedMinutes: 480,
          hourlyRateCents: 10_000,
          employmentType: "employment_contract",
        },
      ],
    });

    assert.equal(summary.plannedLaborBaseCents, 80_000);
    assert.equal(summary.plannedLaborEmployerCents, 100_000);
    assert.equal(summary.totalPlannedCents, 100_000);
  });

  it("calculates profitability", () => {
    const summary = computeBudgetSummary({
      totalBudgetCents: 1_000_000,
      items: [{ grossAmountCents: 700_000, netAmountCents: 569_106, deductible: true }],
      laborItems: [
        { plannedMinutes: 600, hourlyRateCents: 10_000, employmentType: "b2b" },
      ],
    });

    assert.equal(summary.profitCents, 1_000_000 - 700_000 - 100_000);
    assert.equal(summary.profitabilityPercent, 20);
    assert.equal(summary.profitabilityLevel, "moderate");
  });

  it("marks high profitability at 30%+", () => {
    const summary = computeBudgetSummary({
      totalBudgetCents: 100_000_00,
      items: [{ grossAmountCents: 50_000_00, netAmountCents: 40_650_41, deductible: true }],
      laborItems: [],
    });

    assert.equal(summary.profitCents, 50_000_00);
    assert.equal(summary.profitabilityPercent, 50);
    assert.equal(summary.profitabilityLevel, "high");
  });

  it("sets utilization level thresholds", () => {
    const within = computeBudgetSummary({
      totalBudgetCents: 100_000,
      items: [{ grossAmountCents: 70_000, netAmountCents: 70_000, deductible: true }],
      laborItems: [],
    });
    assert.equal(within.utilizationLevel, "healthy");
    assert.equal(within.status, "within");

    const warning = computeBudgetSummary({
      totalBudgetCents: 100_000,
      items: [{ grossAmountCents: 85_000, netAmountCents: 85_000, deductible: true }],
      laborItems: [],
    });
    assert.equal(warning.utilizationLevel, "warning");
    assert.equal(warning.status, "near_limit");

    const critical = computeBudgetSummary({
      totalBudgetCents: 100_000,
      items: [{ grossAmountCents: 96_000, netAmountCents: 96_000, deductible: true }],
      laborItems: [],
    });
    assert.equal(critical.utilizationLevel, "critical");

    const exceeded = computeBudgetSummary({
      totalBudgetCents: 100_000,
      items: [{ grossAmountCents: 110_000, netAmountCents: 110_000, deductible: true }],
      laborItems: [],
    });
    assert.equal(exceeded.status, "exceeded");
    assert.equal(exceeded.remainingCents, -10_000);
  });
});
