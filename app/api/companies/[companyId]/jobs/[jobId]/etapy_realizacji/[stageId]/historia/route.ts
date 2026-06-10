import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { isUserAssignedToJob } from "@/lib/server/jobs/job-assignments";
import { listStageHistory } from "@/lib/server/jobs/stage-history";
import { isOwnerOrAdmin } from "@/lib/server/jobs/stage-permissions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string; stageId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId, stageId } = await params;

    const member = await requireActiveMember(companyId, userId);
    const role = (member.role || "staff") as "owner" | "admin" | "staff";

    const stage = await prisma.jobStage.findFirst({
      where: { id: stageId, companyId, jobId },
    });
    if (!stage) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    if (!isOwnerOrAdmin(role)) {
      const assigned = await isUserAssignedToJob(jobId, userId, companyId);
      if (!assigned) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
    }

    const items = await listStageHistory({ companyId, jobId, stageId });
    return NextResponse.json({ items }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
