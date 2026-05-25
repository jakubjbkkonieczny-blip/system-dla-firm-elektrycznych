import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { requireOwnerOrAdmin } from "@/lib/server/attendance/require-owner-admin";
import { getAttendanceHoursSummary } from "@/lib/server/attendance/get-attendance-hours";

type Ctx = { params: Promise<{ companyId: string; userId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const actorId = sessionUser.id;
    const { companyId, userId } = await params;

    const me = await requireActiveMember(companyId, actorId);
    requireOwnerOrAdmin(me);

    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? undefined;

    const payload = await getAttendanceHoursSummary({
      companyId,
      userId,
      actorId,
      member: me,
      date,
    });
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
      if (msg === "MEMBER_NOT_FOUND") return 404;
      return companyRouteErrorStatus(msg);
    });
  }
}
