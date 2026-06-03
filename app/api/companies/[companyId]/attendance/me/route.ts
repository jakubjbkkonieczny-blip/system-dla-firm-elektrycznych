import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import {
  getTodayAttendanceMe,
  performAttendanceAction,
} from "@/lib/server/attendance/attendance-actions";
import type { AttendanceAction } from "@/lib/attendance/types";

type Ctx = { params: Promise<{ companyId: string }> };

const ACTIONS: AttendanceAction[] = [
  "start_work",
  "start_break",
  "end_break",
  "finish_work",
];

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId } = await params;
    await requireActiveMember(companyId, sessionUser.id);

    const session = await getTodayAttendanceMe(companyId, sessionUser.id);
    return NextResponse.json(session, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId } = await params;
    await requireActiveMember(companyId, sessionUser.id);

    const body = (await req.json()) as {
      action?: string;
      locationText?: string;
    };

    const action = body.action as AttendanceAction;
    if (!action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
    }

    const result = await performAttendanceAction({
      companyId,
      userId: sessionUser.id,
      action,
      locationText: body.locationText,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (
        msg === "ALREADY_STARTED" ||
        msg === "ALREADY_FINISHED" ||
        msg === "INVALID_STATE" ||
        msg === "NOT_STARTED" ||
        msg === "NO_BREAK_START"
      ) {
        return 400;
      }
      return companyRouteErrorStatus(msg);
    });
  }
}
