import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { getAttendanceDashboard } from "@/lib/server/attendance/get-attendance-dashboard";
import { requireOwnerOrAdmin } from "@/lib/server/attendance/require-owner-admin";
import type { AttendanceStatus } from "@/lib/attendance/types";

type Ctx = { params: Promise<{ companyId: string }> };

const VALID_STATUSES: AttendanceStatus[] = ["working", "break", "finished", "absent"];

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, userId);
    requireOwnerOrAdmin(me);

    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? undefined;
    const userIdFilter = url.searchParams.get("userId") ?? undefined;
    const statusParam = url.searchParams.get("status") ?? undefined;
    const demo = url.searchParams.get("demo") === "1";

    const status =
      statusParam && VALID_STATUSES.includes(statusParam as AttendanceStatus)
        ? statusParam
        : undefined;

    const payload = await getAttendanceDashboard({
      companyId,
      date,
      userId: userIdFilter || undefined,
      status,
      demo,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
      return companyRouteErrorStatus(msg);
    });
  }
}
