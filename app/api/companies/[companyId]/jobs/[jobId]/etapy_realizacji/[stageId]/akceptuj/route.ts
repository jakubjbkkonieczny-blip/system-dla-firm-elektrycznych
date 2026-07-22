import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { recordStageHistory } from "@/lib/server/jobs/stage-history";
import {
  buildStageAccessContext,
  canApproveStage,
} from "@/lib/server/jobs/stage-permissions";
import {
  loadStageNotificationContext,
  notifyStageApproved,
} from "@/lib/server/notifications/stage-notifications";

function todayYyyyMmDd() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(
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

    const ctx = await buildStageAccessContext({
      role,
      userId,
      companyId,
      jobId,
      stage,
    });

    if (!canApproveStage(ctx)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const now = new Date();
    const completedAt = new Date(`${todayYyyyMmDd()}T12:00:00.000Z`);

    await prisma.jobStage.update({
      where: { id: stageId },
      data: {
        status: "done",
        completedAt,
        completedByUserId: stage.submittedByUserId ?? userId,
        approvedAt: now,
        approvedByUserId: userId,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionComment: null,
      },
    });

    await recordStageHistory({
      companyId,
      jobId,
      stageId,
      eventType: "approved",
      actorUserId: userId,
    });

    const notificationContext = await loadStageNotificationContext({
      companyId,
      jobId,
      stage: { id: stageId, name: stage.name },
      actorUserId: userId,
    });
    if (notificationContext) {
      void notifyStageApproved({
        context: notificationContext,
        supervisorUserId: stage.supervisorUserId,
        submittedByUserId: stage.submittedByUserId,
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
