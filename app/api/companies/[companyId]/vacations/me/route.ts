import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { getEmployeeVacationDashboard } from "@/lib/server/vacations/get-employee-vacation-dashboard";
import { createVacationRequest } from "@/lib/server/vacations/vacation-actions";
import type { VacationStatus } from "@/lib/vacations/types";

type Ctx = { params: Promise<{ companyId: string }> };

const VALID_STATUSES: VacationStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId } = await params;

    await requireActiveMember(companyId, sessionUser.id);

    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? undefined;
    const statusParam = url.searchParams.get("status") ?? undefined;

    const status =
      statusParam && VALID_STATUSES.includes(statusParam as VacationStatus)
        ? statusParam
        : undefined;

    const payload = await getEmployeeVacationDashboard({
      companyId,
      userId: sessionUser.id,
      month,
      status,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId } = await params;

    await requireActiveMember(companyId, sessionUser.id);

    const body = await req.json();
    const type = String(body?.type ?? "").trim();
    const startDate = String(body?.startDate ?? "").trim();
    const endDate = String(body?.endDate ?? "").trim();
    const reason = body?.reason != null ? String(body.reason) : null;

    if (!type || !startDate || !endDate) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    const created = await createVacationRequest({
      companyId,
      userId: sessionUser.id,
      type,
      startDate,
      endDate,
      reason,
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (
        msg === "INVALID_TYPE" ||
        msg === "INVALID_DATES" ||
        msg === "INVALID_DATE_RANGE" ||
        msg === "INVALID_EMPLOYEE"
      ) {
        return 400;
      }
      return companyRouteErrorStatus(msg);
    });
  }
}
