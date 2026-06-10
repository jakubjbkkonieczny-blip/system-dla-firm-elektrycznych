import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { canSubmitStageForApproval } from "@/lib/jobs/stage-status";
import { stageDbToPl } from "@/lib/jobs/stage-status";
import { recordStageHistory } from "@/lib/server/jobs/stage-history";
import {
  buildStageAccessContext,
  canSubmitStage,
} from "@/lib/server/jobs/stage-permissions";

type Body = {
  notatka_pracownika?: string;
  lista_zdjec?: string[];
};

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

    if (!canSubmitStage(ctx)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const pl = stageDbToPl(stage.status);
    if (!canSubmitStageForApproval(pl)) {
      return NextResponse.json({ error: "INVALID_STAGE_STATUS" }, { status: 400 });
    }

    const body = (await req.json()) as Body;
    const note = String(body.notatka_pracownika || "");

    const now = new Date();
    await prisma.jobStage.update({
      where: { id: stageId },
      data: {
        status: "pending_approval",
        workerNote: note,
        submittedForApprovalAt: now,
        submittedByUserId: userId,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionComment: null,
      },
    });

    await recordStageHistory({
      companyId,
      jobId,
      stageId,
      eventType: "submitted_for_approval",
      actorUserId: userId,
      comment: note || null,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
