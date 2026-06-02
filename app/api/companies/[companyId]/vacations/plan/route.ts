import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { requireOwnerOrAdmin } from "@/lib/server/attendance/require-owner-admin";
import { getAbsencePlan } from "@/lib/server/vacations/get-absence-plan";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, sessionUser.id);
    requireOwnerOrAdmin(me);

    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "30");

    const payload = await getAbsencePlan({
      companyId,
      month,
      userId: userId || undefined,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 30,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
      return companyRouteErrorStatus(msg);
    });
  }
}
