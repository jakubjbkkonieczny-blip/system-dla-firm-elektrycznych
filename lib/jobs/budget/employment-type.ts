/**
 * Employment types for planned labor cost estimation.
 * Multipliers are estimates only — not legal payroll advice.
 */

export const EMPLOYMENT_TYPE_VALUES = [
  "b2b",
  "subcontractor",
  "student_under_26",
  "mandate_contract",
  "employment_contract",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPE_VALUES)[number];

export type EmploymentTypeDefinition = {
  value: EmploymentType;
  label: string;
  /** Multiplier as basis points: 10000 = 1.00 */
  defaultMultiplierBasisPoints: number;
};

export const EMPLOYMENT_TYPE_DEFINITIONS: readonly EmploymentTypeDefinition[] = [
  { value: "b2b", label: "B2B", defaultMultiplierBasisPoints: 10000 },
  { value: "subcontractor", label: "Podwykonawca", defaultMultiplierBasisPoints: 10000 },
  { value: "student_under_26", label: "Student <26", defaultMultiplierBasisPoints: 10000 },
  { value: "mandate_contract", label: "Umowa zlecenie", defaultMultiplierBasisPoints: 11500 },
  { value: "employment_contract", label: "Umowa o pracę", defaultMultiplierBasisPoints: 12500 },
] as const;

const BY_VALUE = new Map(EMPLOYMENT_TYPE_DEFINITIONS.map((d) => [d.value, d]));

export function isEmploymentType(value: string): value is EmploymentType {
  return (EMPLOYMENT_TYPE_VALUES as readonly string[]).includes(value);
}

export function getEmploymentTypeDefinition(type: EmploymentType): EmploymentTypeDefinition {
  return BY_VALUE.get(type) ?? EMPLOYMENT_TYPE_DEFINITIONS[0];
}

export function getEmploymentTypeLabel(type: EmploymentType): string {
  return getEmploymentTypeDefinition(type).label;
}

export function formatMultiplierBasisPoints(basisPoints: number): string {
  const value = basisPoints / 10000;
  return value % 1 === 0 ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
