import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { getJobPrimaryAssigneeId } from "@/lib/server/jobs/job-assignments";

type Ctx = { params: Promise<{ companyId: string; jobId: string; stageId: string }> };

function todayYyyyMmDd() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId, stageId } = await params;

    const me = await requireActiveMember(companyId, userId);
    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!job) throw new Error("JOB_NOT_FOUND");

    const isAdmin = me.role === "owner" || me.role === "admin";
    const primary = await getJobPrimaryAssigneeId(jobId);
    const isAssignedStaff = primary === userId;

    if (!isAdmin && !isAssignedStaff) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as {
      notatka_pracownika?: string;
      lista_zdjec?: string[];
    };

    const notatka_pracownika = (body?.notatka_pracownika || "").trim();

    const stage = await prisma.jobStage.findFirst({
      where: { id: stageId, companyId, jobId },
    });
    if (!stage) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    await prisma.jobStage.update({
      where: { id: stageId },
      data: {
        status: "done",
        completedAt: new Date(`${todayYyyyMmDd()}T12:00:00.000Z`),
        completedByUserId: userId,
        workerNote: notatka_pracownika,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
