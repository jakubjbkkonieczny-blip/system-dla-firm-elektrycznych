import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { BUDGET_PAGE_SIZE_DEFAULT } from "@/lib/jobs/budget/config";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import {
  assertCompanyUser,
  getOrCreateJobBudget,
  requireJobBudgetAdmin,
} from "@/lib/server/jobs/budget-access";
import {
  loadBudgetHeaderPayload,
  loadBudgetLaborPage,
} from "@/lib/server/jobs/budget-response";
import {
  parseBudgetLaborBody,
  parsePaginationParams,
} from "@/lib/server/jobs/budget-validation";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

function budgetErrorStatus(msg: string): number {
  if (msg === "FORBIDDEN") return 403;
  if (msg === "JOB_NOT_FOUND" || msg === "INVALID_USER") return msg === "INVALID_USER" ? 400 : 404;
  return companyRouteErrorStatus(msg) ?? 500;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const { page, limit } = parsePaginationParams(
      new URL(req.url).searchParams,
      BUDGET_PAGE_SIZE_DEFAULT
    );

    const payload = await loadBudgetLaborPage(companyId, jobId, page, limit);
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetErrorStatus);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const body = (await req.json()) as Record<string, unknown>;
    const parsed = parseBudgetLaborBody(body);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: parsed.errors[0] }, { status: 400 });
    }

    await assertCompanyUser(companyId, parsed.userId);

    const budget = await getOrCreateJobBudget(companyId, jobId);

    await prisma.jobBudgetLaborItem.create({
      data: {
        companyId,
        jobId,
        budgetId: budget.id,
        userId: parsed.userId ?? null,
        employmentType: parsed.employmentType ?? "b2b",
        plannedMinutes: parsed.plannedMinutes!,
        hourlyRateCents: parsed.hourlyRateCents!,
        plannedDate: parsed.plannedDate ?? null,
        note: parsed.note ?? null,
        createdByUserId: sessionUser.id,
      },
    });

    const payload = await loadBudgetHeaderPayload(companyId, jobId);
    return NextResponse.json(payload, { status: 201 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetErrorStatus);
  }
}
