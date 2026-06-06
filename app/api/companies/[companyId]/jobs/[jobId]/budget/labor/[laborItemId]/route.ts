import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import {
  assertBudgetLaborScope,
  assertCompanyUser,
  getOrCreateJobBudget,
  requireJobBudgetAdmin,
} from "@/lib/server/jobs/budget-access";
import { loadBudgetHeaderPayload } from "@/lib/server/jobs/budget-response";
import { parseBudgetLaborBody } from "@/lib/server/jobs/budget-validation";

type Ctx = { params: Promise<{ companyId: string; jobId: string; laborItemId: string }> };

function budgetErrorStatus(msg: string): number {
  if (msg === "FORBIDDEN") return 403;
  if (msg === "JOB_NOT_FOUND" || msg === "LABOR_NOT_FOUND") return 404;
  if (msg === "INVALID_USER") return 400;
  return companyRouteErrorStatus(msg) ?? 500;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId, laborItemId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const budget = await getOrCreateJobBudget(companyId, jobId);
    await assertBudgetLaborScope(companyId, jobId, budget.id, laborItemId);

    const body = (await req.json()) as Record<string, unknown>;
    const parsed = parseBudgetLaborBody(body, true);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: parsed.errors[0] }, { status: 400 });
    }

    if (parsed.userId !== undefined) {
      await assertCompanyUser(companyId, parsed.userId);
    }

    await prisma.jobBudgetLaborItem.update({
      where: { id: laborItemId },
      data: {
        ...(parsed.plannedMinutes !== undefined ? { plannedMinutes: parsed.plannedMinutes } : {}),
        ...(parsed.hourlyRateCents !== undefined ? { hourlyRateCents: parsed.hourlyRateCents } : {}),
        ...(parsed.userId !== undefined ? { userId: parsed.userId } : {}),
        ...(parsed.employmentType !== undefined ? { employmentType: parsed.employmentType } : {}),
        ...(parsed.plannedDate !== undefined ? { plannedDate: parsed.plannedDate } : {}),
        ...(parsed.note !== undefined ? { note: parsed.note } : {}),
      },
    });

    const payload = await loadBudgetHeaderPayload(companyId, jobId);
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetErrorStatus);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId, laborItemId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const budget = await getOrCreateJobBudget(companyId, jobId);
    await assertBudgetLaborScope(companyId, jobId, budget.id, laborItemId);

    await prisma.jobBudgetLaborItem.delete({ where: { id: laborItemId } });

    const payload = await loadBudgetHeaderPayload(companyId, jobId);
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetErrorStatus);
  }
}
