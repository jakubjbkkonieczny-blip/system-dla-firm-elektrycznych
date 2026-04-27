import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { getJobPrimaryAssigneeId } from "@/lib/server/jobs/job-assignments";

type Body = {
  notatka_pracownika?: string;
  lista_zdjec?: string[];
};

function todayYyyyMmDd() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

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

    const assignedTo = await getJobPrimaryAssigneeId(jobId);
    const can =
      role === "owner" ||
      role === "admin" ||
      (role === "staff" && assignedTo && assignedTo === userId);

    if (!can) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const body = (await req.json()) as Body;
    const note = String(body.notatka_pracownika || "");

    await prisma.jobStage.update({
      where: { id: stageId },
      data: {
        status: "done",
        completedAt: new Date(`${todayYyyyMmDd()}T12:00:00.000Z`),
        completedByUserId: userId,
        workerNote: note,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
