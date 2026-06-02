import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { requireOwnerOrAdmin } from "@/lib/server/attendance/require-owner-admin";
import { getVacationsDashboard } from "@/lib/server/vacations/get-vacations-dashboard";
import { createVacationRequest } from "@/lib/server/vacations/vacation-actions";
import type { VacationStatus } from "@/lib/vacations/types";

type Ctx = { params: Promise<{ companyId: string }> };

const VALID_STATUSES: VacationStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, sessionUser.id);
    requireOwnerOrAdmin(me);

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;

    const status =
      statusParam && VALID_STATUSES.includes(statusParam as VacationStatus)
        ? statusParam
        : undefined;

    const payload = await getVacationsDashboard({
      companyId,
      status,
      userId: userId || undefined,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
      return companyRouteErrorStatus(msg);
    });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, sessionUser.id);
    requireOwnerOrAdmin(me);

    const body = await req.json();
    const userId = String(body?.userId ?? "").trim();
    const type = String(body?.type ?? "").trim();
    const startDate = String(body?.startDate ?? "").trim();
    const endDate = String(body?.endDate ?? "").trim();
    const reason = body?.reason != null ? String(body.reason) : null;

    if (!userId || !type || !startDate || !endDate) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    const created = await createVacationRequest({
      companyId,
      userId,
      type,
      startDate,
      endDate,
      reason,
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
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
