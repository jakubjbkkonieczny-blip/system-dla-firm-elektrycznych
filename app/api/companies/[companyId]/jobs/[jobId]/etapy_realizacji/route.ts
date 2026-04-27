import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { jobStageToPl } from "@/lib/server/jobs/job-stage-dto";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";

type CreateStageBody = {
  nazwa_etapu: string;
  opis_etapu?: string;
  planowana_data?: string;
};

function isYyyyMmDd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId } = await params;

    await requireActiveMember(companyId, userId);

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId } = await params;

    const member = await requireActiveMember(companyId, userId);
    const role = (member.role || "staff") as "owner" | "admin" | "staff";
    if (!(role === "owner" || role === "admin")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as CreateStageBody;

    const nazwa_etapu = (body.nazwa_etapu || "").trim();
    const opis_etapu = (body.opis_etapu || "").trim();
    const planowana_data_raw = (body.planowana_data || "").trim();
    const planowana_data = planowana_data_raw ? planowana_data_raw : "";

    if (!nazwa_etapu) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }
    if (planowana_data && !isYyyyMmDd(planowana_data)) {
      return NextResponse.json({ error: "BAD_DATE_FORMAT" }, { status: 400 });
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

    return NextResponse.json({ stageId: stage.id }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
