import {
  getEmploymentTypeDefinition,
  type EmploymentType,
} from "@/lib/jobs/budget/employment-type";
import { laborCostCents } from "@/lib/jobs/budget/money";

export type LaborCostInput = {
  plannedMinutes: number;
  hourlyRateCents: number;
  employmentType: EmploymentType;
};

export type LaborCostResult = {
  employmentType: EmploymentType;
  multiplierBasisPoints: number;
  baseLaborCostCents: number;
  employerLaborCostCents: number;
};

/** Future payroll/accounting modules can implement this interface. */
export interface LaborCostEngine {
  compute(input: LaborCostInput): LaborCostResult;
}

export type LaborCostEngineOptions = {
  /** Override default multipliers (basis points). Used by Settings in the future. */
  multiplierOverrides?: Partial<Record<EmploymentType, number>>;
};

function resolveMultiplierBasisPoints(
  employmentType: EmploymentType,
  overrides?: Partial<Record<EmploymentType, number>>
): number {
  const override = overrides?.[employmentType];
  if (override != null && Number.isInteger(override) && override >= 0) {
    return override;
  }
  return getEmploymentTypeDefinition(employmentType).defaultMultiplierBasisPoints;
}

export function employerLaborCostCents(
  baseLaborCostCents: number,
  multiplierBasisPoints: number
): number {
  return Math.round((baseLaborCostCents * multiplierBasisPoints) / 10000);
}

export class MultiplierLaborCostEngine implements LaborCostEngine {
  constructor(private readonly options: LaborCostEngineOptions = {}) {}

  compute(input: LaborCostInput): LaborCostResult {
    const baseLaborCostCents = laborCostCents(input.plannedMinutes, input.hourlyRateCents);
    const multiplierBasisPoints = resolveMultiplierBasisPoints(
      input.employmentType,
      this.options.multiplierOverrides
    );
    const employerCost = employerLaborCostCents(baseLaborCostCents, multiplierBasisPoints);

    return {
      employmentType: input.employmentType,
      multiplierBasisPoints,
      baseLaborCostCents,
      employerLaborCostCents: employerCost,
    };
  }
}

let defaultEngine: LaborCostEngine = new MultiplierLaborCostEngine();

/** Swap engine implementation (e.g. future payroll module) without DB changes. */
export function setLaborCostEngine(engine: LaborCostEngine): void {
  defaultEngine = engine;
}

export function getLaborCostEngine(options?: LaborCostEngineOptions): LaborCostEngine {
  if (options?.multiplierOverrides && Object.keys(options.multiplierOverrides).length > 0) {
    return new MultiplierLaborCostEngine(options);
  }
  return defaultEngine;
}

export function computeLaborCost(
  input: LaborCostInput,
  options?: LaborCostEngineOptions
): LaborCostResult {
  return getLaborCostEngine(options).compute(input);
}
