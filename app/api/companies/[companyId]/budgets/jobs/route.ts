import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { computeBudgetSummary } from "@/lib/jobs/budget/calculations";
import { isEmploymentType } from "@/lib/jobs/budget/employment-type";
import { BUDGET_JOBS_PAGE_SIZE_DEFAULT } from "@/lib/jobs/budget/config";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireBudgetAdmin } from "@/lib/server/jobs/budget-access";
import { parsePaginationParams } from "@/lib/server/jobs/budget-validation";

type Ctx = { params: Promise<{ companyId: string }> };

function budgetErrorStatus(msg: string): number {
  if (msg === "FORBIDDEN") return 403;
  return companyRouteErrorStatus(msg) ?? 500;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId } = await params;
    await requireBudgetAdmin(companyId, sessionUser.id);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const status = (url.searchParams.get("status") || "").trim();
    const { page, limit, skip } = parsePaginationParams(
      url.searchParams,
      BUDGET_JOBS_PAGE_SIZE_DEFAULT,
      100
    );

    const where = {
      companyId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { customerName: { contains: q, mode: "insensitive" as const } },
              { addressCity: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          jobNumber: true,
          customerName: true,
          status: true,
          priority: true,
          addressCity: true,
          createdAt: true,
          budget: {
            select: {
              id: true,
              totalBudgetCents: true,
              items: {
                select: { grossAmountCents: true, netAmountCents: true, deductible: true },
              },
              laborItems: {
                select: { plannedMinutes: true, hourlyRateCents: true, employmentType: true },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      jobs: jobs.map((j) => {
        let budgetUtilizationPercent: number | null = null;
        let remainingCents: number | null = null;

        if (j.budget) {
          const summary = computeBudgetSummary({
            totalBudgetCents: j.budget.totalBudgetCents,
            items: j.budget.items,
            laborItems: j.budget.laborItems.map((l) => ({
              plannedMinutes: l.plannedMinutes,
              hourlyRateCents: l.hourlyRateCents,
              employmentType: isEmploymentType(l.employmentType) ? l.employmentType : "b2b",
            })),
          });
          budgetUtilizationPercent = summary.budgetUtilizationPercent;
          remainingCents = summary.remainingCents;
        }

        return {
          id: j.id,
          jobNumber: j.jobNumber,
          customerName: j.customerName,
          status: j.status,
          priority: j.priority,
          addressCity: j.addressCity,
          createdAt: j.createdAt.toISOString(),
          totalBudgetCents: j.budget?.totalBudgetCents ?? null,
          hasBudget: j.budget != null,
          budgetUtilizationPercent,
          remainingCents,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetErrorStatus);
  }
}
