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
  canRejectStage,
} from "@/lib/server/jobs/stage-permissions";
import {
  loadStageNotificationContext,
  notifyStageRejected,
} from "@/lib/server/notifications/stage-notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string; stageId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId, stageId } = await params;

    const member = await requireActiveMember(companyId, userId);
    const role = (member.role || "staff") as "owner" | "admin" | "staff";

    const body = (await req.json()) as { komentarz?: string };
    const comment = String(body.komentarz ?? "").trim();
    if (!comment) {
      return NextResponse.json({ error: "MISSING_REJECTION_COMMENT" }, { status: 400 });
    }

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

    if (!canRejectStage(ctx)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const now = new Date();

    await prisma.jobStage.update({
      where: { id: stageId },
      data: {
        status: "needs_changes",
        rejectedAt: now,
        rejectedByUserId: userId,
        rejectionComment: comment,
        submittedForApprovalAt: null,
        submittedByUserId: null,
        completedAt: null,
        completedByUserId: null,
        approvedAt: null,
        approvedByUserId: null,
      },
    });

    await recordStageHistory({
      companyId,
      jobId,
      stageId,
      eventType: "rejected",
      actorUserId: userId,
      comment,
    });

    const notificationContext = await loadStageNotificationContext({
      companyId,
      jobId,
      stage: { id: stageId, name: stage.name },
      actorUserId: userId,
    });
    if (notificationContext) {
      void notifyStageRejected({
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
