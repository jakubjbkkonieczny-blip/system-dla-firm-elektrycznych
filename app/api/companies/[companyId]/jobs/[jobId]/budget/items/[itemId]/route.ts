import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import {
  assertBudgetItemScope,
  assertCompanyUser,
  getOrCreateJobBudget,
  requireJobBudgetAdmin,
} from "@/lib/server/jobs/budget-access";
import { loadBudgetHeaderPayload } from "@/lib/server/jobs/budget-response";
import { parseBudgetItemBody } from "@/lib/server/jobs/budget-validation";
import { resolveItemAmounts } from "@/lib/jobs/budget/money";

type Ctx = { params: Promise<{ companyId: string; jobId: string; itemId: string }> };

function budgetErrorStatus(msg: string): number {
  if (msg === "FORBIDDEN") return 403;
  if (msg === "JOB_NOT_FOUND" || msg === "ITEM_NOT_FOUND") return 404;
  if (msg === "INVALID_USER") return 400;
  return companyRouteErrorStatus(msg) ?? 500;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId, itemId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const budget = await getOrCreateJobBudget(companyId, jobId);
    const existing = await assertBudgetItemScope(companyId, jobId, budget.id, itemId);

    const body = (await req.json()) as Record<string, unknown>;
    const parsed = parseBudgetItemBody(body, true);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: parsed.errors[0] }, { status: 400 });
    }

    if (parsed.assignedUserId !== undefined) {
      await assertCompanyUser(companyId, parsed.assignedUserId);
    }

    const amountSource =
      body.amountSource === "net" || body.amountSource === "gross"
        ? body.amountSource
        : parsed.grossAmountCents !== undefined
          ? "gross"
          : parsed.netAmountCents !== undefined
            ? "net"
            : undefined;

    const mergedGross =
      parsed.grossAmountCents !== undefined ? parsed.grossAmountCents : existing.grossAmountCents;
    const mergedNet =
      parsed.netAmountCents !== undefined ? parsed.netAmountCents : existing.netAmountCents;
    const mergedVat = parsed.vatRate !== undefined ? parsed.vatRate : existing.vatRate;

    const amounts =
      amountSource != null
        ? resolveItemAmounts({
            grossAmountCents: mergedGross,
            netAmountCents: mergedNet,
            vatRate: mergedVat,
            amountSource,
          })
        : null;

    const netAmountCents = amounts?.netCents ?? mergedNet;
    const grossAmountCents = amounts?.grossCents ?? mergedGross;
    const vatRate = mergedVat;

    if (parsed.name !== undefined && !parsed.name) {
      return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
    }

    await prisma.jobBudgetItem.update({
      where: { id: itemId },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.category !== undefined ? { category: parsed.category } : {}),
        ...(parsed.taxCategory !== undefined ? { taxCategory: parsed.taxCategory } : {}),
        netAmountCents,
        vatRate,
        grossAmountCents,
        ...(parsed.deductible !== undefined ? { deductible: parsed.deductible } : {}),
        ...(parsed.documentType !== undefined ? { documentType: parsed.documentType } : {}),
        ...(parsed.documentNumber !== undefined ? { documentNumber: parsed.documentNumber } : {}),
        ...(parsed.supplier !== undefined ? { supplier: parsed.supplier } : {}),
        ...(parsed.plannedDate !== undefined ? { plannedDate: parsed.plannedDate } : {}),
        ...(parsed.assignedUserId !== undefined ? { assignedUserId: parsed.assignedUserId } : {}),
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
    const { companyId, jobId, itemId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const budget = await getOrCreateJobBudget(companyId, jobId);
    await assertBudgetItemScope(companyId, jobId, budget.id, itemId);

    await prisma.jobBudgetItem.delete({ where: { id: itemId } });

    const payload = await loadBudgetHeaderPayload(companyId, jobId);
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetErrorStatus);
  }
}
