import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { getAttendanceHistory } from "@/lib/server/attendance/get-attendance-history";
import { clampAttendanceHistoryLimit } from "@/lib/server/attendance/pagination";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const actorId = sessionUser.id;
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, actorId);

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = clampAttendanceHistoryLimit(url.searchParams.get("limit"));

    const payload = await getAttendanceHistory({
      companyId,
      actorId,
      member: me,
      userId,
      limit,
      cursor,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
      return companyRouteErrorStatus(msg);
    });
  }
}
