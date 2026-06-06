import "server-only";
import type { JobBudget, JobBudgetItem, JobBudgetLaborItem, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { computeBudgetSummary } from "@/lib/jobs/budget/calculations";
import { BUDGET_PAGE_SIZE_DEFAULT } from "@/lib/jobs/budget/config";
import { itemTaxCents } from "@/lib/jobs/budget/money";
import {
  formatMultiplierBasisPoints,
  getEmploymentTypeLabel,
  isEmploymentType,
  type EmploymentType,
} from "@/lib/jobs/budget/employment-type";
import { computeLaborCost } from "@/lib/jobs/budget/labor-cost-engine";
import type {
  JobBudgetHeaderPayload,
  JobBudgetItemsPagePayload,
  JobBudgetLaborPagePayload,
  PaginatedMeta,
} from "@/lib/jobs/budget/types";
import { getOrCreateJobBudget } from "@/lib/server/jobs/budget-access";

type ItemWithUsers = JobBudgetItem & {
  assignedUser: Pick<User, "id" | "displayName" | "email"> | null;
};

type LaborWithUser = JobBudgetLaborItem & {
  user: Pick<User, "id" | "displayName" | "email"> | null;
};

function userLabel(u: Pick<User, "displayName" | "email"> | null | undefined): string | null {
  if (!u) return null;
  return (u.displayName ?? "").trim() || u.email || null;
}

function normalizeEmploymentType(raw: string): EmploymentType {
  return isEmploymentType(raw) ? raw : "b2b";
}

function buildPaginatedMeta(page: number, limit: number, total: number): PaginatedMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

async function loadSummaryInputs(companyId: string, jobId: string, budgetId: string) {
  const [itemRows, laborRows] = await Promise.all([
    prisma.jobBudgetItem.findMany({
      where: { companyId, jobId, budgetId },
      select: { grossAmountCents: true, netAmountCents: true, deductible: true },
    }),
    prisma.jobBudgetLaborItem.findMany({
      where: { companyId, jobId, budgetId },
      select: { plannedMinutes: true, hourlyRateCents: true, employmentType: true },
    }),
  ]);

  return { itemRows, laborRows };
}

function computeSummaryFromBudget(
  budget: JobBudget,
  itemRows: { grossAmountCents: number; netAmountCents: number | null; deductible: boolean }[],
  laborRows: { plannedMinutes: number; hourlyRateCents: number; employmentType: string }[]
) {
  return computeBudgetSummary({
    totalBudgetCents: budget.totalBudgetCents,
    items: itemRows,
    laborItems: laborRows.map((l) => ({
      plannedMinutes: l.plannedMinutes,
      hourlyRateCents: l.hourlyRateCents,
      employmentType: normalizeEmploymentType(l.employmentType),
    })),
  });
}

function serializeBudgetItem(item: ItemWithUsers) {
  return {
    id: item.id,
    category: item.category,
    taxCategory: item.taxCategory,
    name: item.name,
    netAmountCents: item.netAmountCents,
    vatRate: item.vatRate,
    taxAmountCents: itemTaxCents(item.netAmountCents, item.grossAmountCents),
    grossAmountCents: item.grossAmountCents,
    deductible: item.deductible,
    documentType: item.documentType,
    documentNumber: item.documentNumber,
    supplier: item.supplier,
    plannedDate: item.plannedDate?.toISOString() ?? null,
    assignedUserId: item.assignedUserId,
    assignedUserLabel: userLabel(item.assignedUser),
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeLaborItem(item: LaborWithUser) {
  const employmentType = normalizeEmploymentType(item.employmentType);
  const costs = computeLaborCost({
    plannedMinutes: item.plannedMinutes,
    hourlyRateCents: item.hourlyRateCents,
    employmentType,
  });

  return {
    id: item.id,
    userId: item.userId,
    userLabel: userLabel(item.user),
    employmentType,
    employmentTypeLabel: getEmploymentTypeLabel(employmentType),
    multiplierBasisPoints: costs.multiplierBasisPoints,
    multiplierLabel: formatMultiplierBasisPoints(costs.multiplierBasisPoints),
    plannedMinutes: item.plannedMinutes,
    hourlyRateCents: item.hourlyRateCents,
    baseLaborCostCents: costs.baseLaborCostCents,
    employerLaborCostCents: costs.employerLaborCostCents,
    laborCostCents: costs.employerLaborCostCents,
    plannedDate: item.plannedDate?.toISOString() ?? null,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function serializeBudgetPayload(
  budget: JobBudget,
  items: ItemWithUsers[],
  laborItems: LaborWithUser[]
) {
  const summary = computeSummaryFromBudget(budget, items, laborItems);

  return {
    budget: {
      id: budget.id,
      jobId: budget.jobId,
      totalBudgetCents: budget.totalBudgetCents,
      note: budget.note,
      createdAt: budget.createdAt.toISOString(),
      updatedAt: budget.updatedAt.toISOString(),
    },
    items: items.map(serializeBudgetItem),
    laborItems: laborItems.map(serializeLaborItem),
    summary,
  };
}

export async function loadBudgetHeaderPayload(
  companyId: string,
  jobId: string
): Promise<JobBudgetHeaderPayload> {
  const budget = await getOrCreateJobBudget(companyId, jobId);

  const [counts, inputs] = await Promise.all([
    Promise.all([
      prisma.jobBudgetItem.count({ where: { companyId, jobId, budgetId: budget.id } }),
      prisma.jobBudgetLaborItem.count({ where: { companyId, jobId, budgetId: budget.id } }),
    ]),
    loadSummaryInputs(companyId, jobId, budget.id),
  ]);

  const summary = computeSummaryFromBudget(budget, inputs.itemRows, inputs.laborRows);

  return {
    budget: {
      id: budget.id,
      jobId: budget.jobId,
      totalBudgetCents: budget.totalBudgetCents,
      note: budget.note,
      createdAt: budget.createdAt.toISOString(),
      updatedAt: budget.updatedAt.toISOString(),
    },
    summary,
    counts: {
      items: counts[0],
      laborItems: counts[1],
    },
  };
}

export async function loadBudgetItemsPage(
  companyId: string,
  jobId: string,
  page = 1,
  limit = BUDGET_PAGE_SIZE_DEFAULT
): Promise<JobBudgetItemsPagePayload> {
  const budget = await getOrCreateJobBudget(companyId, jobId);
  const skip = (page - 1) * limit;

  const [total, items, inputs] = await Promise.all([
    prisma.jobBudgetItem.count({ where: { companyId, jobId, budgetId: budget.id } }),
    prisma.jobBudgetItem.findMany({
      where: { companyId, jobId, budgetId: budget.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        assignedUser: { select: { id: true, displayName: true, email: true } },
      },
    }),
    loadSummaryInputs(companyId, jobId, budget.id),
  ]);

  const summary = computeSummaryFromBudget(budget, inputs.itemRows, inputs.laborRows);

  return {
    items: items.map(serializeBudgetItem),
    meta: buildPaginatedMeta(page, limit, total),
    summary,
  };
}

export async function loadBudgetLaborPage(
  companyId: string,
  jobId: string,
  page = 1,
  limit = BUDGET_PAGE_SIZE_DEFAULT
): Promise<JobBudgetLaborPagePayload> {
  const budget = await getOrCreateJobBudget(companyId, jobId);
  const skip = (page - 1) * limit;

  const [total, laborItems, inputs] = await Promise.all([
    prisma.jobBudgetLaborItem.count({ where: { companyId, jobId, budgetId: budget.id } }),
    prisma.jobBudgetLaborItem.findMany({
      where: { companyId, jobId, budgetId: budget.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    }),
    loadSummaryInputs(companyId, jobId, budget.id),
  ]);

  const summary = computeSummaryFromBudget(budget, inputs.itemRows, inputs.laborRows);

  return {
    laborItems: laborItems.map(serializeLaborItem),
    meta: buildPaginatedMeta(page, limit, total),
    summary,
  };
}

/** Full payload — used after mutations for backward compatibility. */
export async function loadBudgetPayload(companyId: string, jobId: string) {
  const budget = await getOrCreateJobBudget(companyId, jobId);

  const [items, laborItems] = await Promise.all([
    prisma.jobBudgetItem.findMany({
      where: { companyId, jobId, budgetId: budget.id },
      orderBy: { createdAt: "desc" },
      include: {
        assignedUser: { select: { id: true, displayName: true, email: true } },
      },
    }),
    prisma.jobBudgetLaborItem.findMany({
      where: { companyId, jobId, budgetId: budget.id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    }),
  ]);

  return serializeBudgetPayload(budget, items, laborItems);
}
