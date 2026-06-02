import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { requireOwnerOrAdmin } from "@/lib/server/attendance/require-owner-admin";
import { decideVacationRequest } from "@/lib/server/vacations/vacation-actions";

type Ctx = { params: Promise<{ companyId: string; id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, id } = await params;

    const me = await requireActiveMember(companyId, sessionUser.id);
    requireOwnerOrAdmin(me);

    const body = await req.json();
    const action = String(body?.action ?? "").trim();

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
    }

    await decideVacationRequest({
      companyId,
      requestId: id,
      action,
      decidedById: sessionUser.id,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
      if (msg === "NOT_FOUND") return 404;
      if (msg === "ALREADY_DECIDED") return 409;
      return companyRouteErrorStatus(msg);
    });
  }
}
