import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import {
  getOrCreateJobBudget,
  requireJobBudgetAdmin,
} from "@/lib/server/jobs/budget-access";
import {
  loadBudgetHeaderPayload,
  loadBudgetPayload,
} from "@/lib/server/jobs/budget-response";
import { parseBudgetPatchBody } from "@/lib/server/jobs/budget-validation";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

function budgetErrorStatus(msg: string): number {
  if (msg === "FORBIDDEN") return 403;
  if (msg === "JOB_NOT_FOUND") return 404;
  return companyRouteErrorStatus(msg) ?? 500;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const include = new URL(req.url).searchParams.get("include") || "header";
    if (include === "all") {
      const payload = await loadBudgetPayload(companyId, jobId);
      return NextResponse.json(payload, { status: 200 });
    }

    const payload = await loadBudgetHeaderPayload(companyId, jobId);
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetErrorStatus);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const body = (await req.json()) as Record<string, unknown>;
    const parsed = parseBudgetPatchBody(body);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: parsed.errors[0] }, { status: 400 });
    }
    if (parsed.totalBudgetCents === undefined && parsed.note === undefined) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    const budget = await getOrCreateJobBudget(companyId, jobId);
    await prisma.jobBudget.update({
      where: { id: budget.id },
      data: {
        ...(parsed.totalBudgetCents !== undefined
          ? { totalBudgetCents: parsed.totalBudgetCents }
          : {}),
        ...(parsed.note !== undefined ? { note: parsed.note } : {}),
      },
    });

    const payload = await loadBudgetHeaderPayload(companyId, jobId);
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetErrorStatus);
  }
}
