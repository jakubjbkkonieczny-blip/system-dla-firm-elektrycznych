import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { isUserAssignedToJob } from "@/lib/server/jobs/job-assignments";
import { recordStageHistory } from "@/lib/server/jobs/stage-history";
import {
  buildStageAccessContext,
  canAssignStageSupervisor,
} from "@/lib/server/jobs/stage-permissions";
import {
  loadStageNotificationContext,
  notifyStageSupervisorChange,
} from "@/lib/server/notifications/stage-notifications";

type Body = {
  kierownik_uid?: string | null;
  moze_tworzyc_etapy?: boolean;
};

export async function PATCH(
  req: NextRequest,
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

    if (!canAssignStageSupervisor(ctx)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const supervisorUid = body.kierownik_uid === null ? null : String(body.kierownik_uid ?? "").trim();
    const canCreateStages = Boolean(body.moze_tworzyc_etapy);

    if (supervisorUid) {
      const assigned = await isUserAssignedToJob(jobId, supervisorUid, companyId);
      if (!assigned) {
        return NextResponse.json({ error: "SUPERVISOR_NOT_ASSIGNED_TO_JOB" }, { status: 400 });
      }
    }

    const previousSupervisorUserId = stage.supervisorUserId;
    const now = new Date();

    await prisma.jobStage.update({
      where: { id: stageId },
      data: {
        supervisorUserId: supervisorUid || null,
        supervisorCanCreateStages: supervisorUid ? canCreateStages : false,
        supervisorAssignedAt: supervisorUid ? now : null,
        supervisorAssignedByUserId: supervisorUid ? userId : null,
      },
    });

    await recordStageHistory({
      companyId,
      jobId,
      stageId,
      eventType: supervisorUid ? "supervisor_assigned" : "supervisor_cleared",
      actorUserId: userId,
      targetUserId: supervisorUid || null,
      metadata: supervisorUid
        ? {
            supervisorCanCreateStages: canCreateStages,
          }
        : null,
    });

    const notificationContext = await loadStageNotificationContext({
      companyId,
      jobId,
      stage: { id: stageId, name: stage.name },
      actorUserId: userId,
    });
    if (notificationContext) {
      void notifyStageSupervisorChange({
        context: notificationContext,
        previousSupervisorUserId,
        newSupervisorUserId: supervisorUid || null,
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
