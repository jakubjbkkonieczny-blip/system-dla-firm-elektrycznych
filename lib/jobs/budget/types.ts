import type {
  BudgetStatus,
  BudgetUtilizationLevel,
  ProfitabilityLevel,
} from "@/lib/jobs/budget/config";
import type { EmploymentType } from "@/lib/jobs/budget/employment-type";

export type JobBudgetSummary = {
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

export type JobBudgetDto = {
  id: string;
  jobId: string;
  totalBudgetCents: number;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type JobBudgetItemDto = {
  id: string;
  category: string;
  taxCategory: string;
  name: string;
  netAmountCents: number | null;
  vatRate: string | null;
  taxAmountCents: number;
  grossAmountCents: number;
  deductible: boolean;
  documentType: string | null;
  documentNumber: string | null;
  supplier: string | null;
  plannedDate: string | null;
  assignedUserId: string | null;
  assignedUserLabel: string | null;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type JobBudgetLaborItemDto = {
  id: string;
  userId: string | null;
  userLabel: string | null;
  employmentType: EmploymentType;
  employmentTypeLabel: string;
  multiplierBasisPoints: number;
  multiplierLabel?: string;
  plannedMinutes: number;
  hourlyRateCents: number;
  baseLaborCostCents: number;
  employerLaborCostCents: number;
  laborCostCents: number;
  plannedDate: string | null;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PaginatedMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type JobBudgetPayload = {
  budget: JobBudgetDto;
  items: JobBudgetItemDto[];
  laborItems: JobBudgetLaborItemDto[];
  summary: JobBudgetSummary;
};

export type JobBudgetHeaderPayload = {
  budget: JobBudgetDto;
  summary: JobBudgetSummary;
  counts: {
    items: number;
    laborItems: number;
  };
};

export type JobBudgetItemsPagePayload = {
  items: JobBudgetItemDto[];
  meta: PaginatedMeta;
  summary: JobBudgetSummary;
};

export type JobBudgetLaborPagePayload = {
  laborItems: JobBudgetLaborItemDto[];
  meta: PaginatedMeta;
  summary: JobBudgetSummary;
};

export type BudgetJobListItem = {
  id: string;
  jobNumber: number;
  customerName: string;
  status: string;
  priority: string;
  addressCity: string;
  createdAt: string;
  totalBudgetCents: number | null;
  hasBudget: boolean;
  budgetUtilizationPercent: number | null;
  remainingCents: number | null;
};

export type BudgetJobsListResponse = {
  jobs: BudgetJobListItem[];
  meta: PaginatedMeta;
};

export type BudgetTabId =
  | "materials"
  | "labor"
  | "summary"
  | "documents"
  | "notes";

export type BudgetExportFormat = "pdf" | "excel" | "csv";
