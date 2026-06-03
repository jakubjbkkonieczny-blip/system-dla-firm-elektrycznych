import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { assertCanAccessStageNotes } from "@/lib/server/jobs/stage-note-access";
import {
  clampStageNoteHistoryLimit,
  getStageNoteHistory,
} from "@/lib/server/jobs/stage-note-history";

type Ctx = {
  params: Promise<{ companyId: string; jobId: string; stageId: string }>;
};

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId, stageId } = await params;

    const member = await requireActiveMember(companyId, userId);
    const role = (member.role || "staff") as "owner" | "admin" | "staff";

    await assertCanAccessStageNotes({ companyId, jobId, userId, role });

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = clampStageNoteHistoryLimit(url.searchParams.get("limit"));

    const payload = await getStageNoteHistory({
      companyId,
      jobId,
      stageId,
      limit,
      cursor,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
      if (msg === "JOB_NOT_FOUND" || msg === "STAGE_NOT_FOUND") return 404;
      return companyRouteErrorStatus(msg);
    });
  }
}
