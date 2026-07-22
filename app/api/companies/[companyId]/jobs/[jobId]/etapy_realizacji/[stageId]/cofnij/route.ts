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
  canReopenStage,
} from "@/lib/server/jobs/stage-permissions";
import {
  loadStageNotificationContext,
  notifyStageReopened,
} from "@/lib/server/notifications/stage-notifications";

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

    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!job) return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });

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

    if (!canReopenStage(ctx)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    await prisma.jobStage.update({
      where: { id: stageId },
      data: {
        status: "in_progress",
        completedAt: null,
        completedByUserId: null,
        submittedForApprovalAt: null,
        submittedByUserId: null,
        approvedAt: null,
        approvedByUserId: null,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionComment: null,
      },
    });

    await recordStageHistory({
      companyId,
      jobId,
      stageId,
      eventType: "reopened",
      actorUserId: userId,
    });

    const notificationContext = await loadStageNotificationContext({
      companyId,
      jobId,
      stage: { id: stageId, name: stage.name },
      actorUserId: userId,
    });
    if (notificationContext) {
      void notifyStageReopened({
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
