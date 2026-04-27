import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { jobStageToPl } from "@/lib/server/jobs/job-stage-dto";
import { getJobPrimaryAssigneeId } from "@/lib/server/jobs/job-assignments";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

function isYyyyMmDd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId } = await params;

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

    const rows = await prisma.jobStage.findMany({
      where: { companyId, jobId },
      orderBy: [{ plannedDate: "asc" }, { createdAt: "asc" }],
      include: { photos: true },
    });

    const stages = rows.map((r) => jobStageToPl(r));
    return NextResponse.json({ stages }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId } = await params;

    const me = await requireActiveMember(companyId, userId);
    const isAdmin = me.role === "owner" || me.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!job) throw new Error("JOB_NOT_FOUND");

    const body = (await req.json()) as {
      nazwa_etapu: string;
      opis_etapu?: string;
      planowana_data?: string;
    };

    const nazwa_etapu = (body?.nazwa_etapu || "").trim();
    const opis_etapu = (body?.opis_etapu || "").trim();
    const planowana_data = (body?.planowana_data || "").trim();

    if (!nazwa_etapu) return NextResponse.json({ error: "MISSING_STAGE_NAME" }, { status: 400 });
    if (planowana_data && !isYyyyMmDd(planowana_data)) {
      return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
    }

    const maxOrder = await prisma.jobStage.aggregate({
      where: { companyId, jobId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;

    const stage = await prisma.jobStage.create({
      data: {
        companyId,
        jobId,
        name: nazwa_etapu,
        description: opis_etapu || null,
        plannedDate: planowana_data
          ? new Date(`${planowana_data}T00:00:00.000Z`)
          : null,
        status: "todo",
        sortOrder,
      },
    });

    return NextResponse.json({ ok: true, stageId: stage.id }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
