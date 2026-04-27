import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { getJobPrimaryAssigneeId } from "@/lib/server/jobs/job-assignments";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";

function isYyyyMmDd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

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

    const body = (await req.json()) as Record<string, unknown>;

    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!job) return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });

    const stage = await prisma.jobStage.findFirst({
      where: { id: stageId, companyId, jobId },
    });
    if (!stage) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    const assignedTo = await getJobPrimaryAssigneeId(jobId);

    if (role === "owner" || role === "admin") {
      const data: Record<string, unknown> = {};
      if (body.nazwa_etapu !== undefined) {
        data.name = String(body.nazwa_etapu || "").trim();
      }
      if (body.opis_etapu !== undefined) {
        data.description = String(body.opis_etapu || "").trim() || null;
      }
      if (body.planowana_data !== undefined) {
        const v = String(body.planowana_data || "").trim();
        if (v && !isYyyyMmDd(v)) {
          return NextResponse.json({ error: "BAD_DATE_FORMAT" }, { status: 400 });
        }
        data.plannedDate = v ? new Date(`${v}T00:00:00.000Z`) : null;
      }
      if (body.notatka_pracownika !== undefined) {
        data.workerNote = String(body.notatka_pracownika || "");
      }
      await prisma.jobStage.update({
        where: { id: stageId },
        data: data as object,
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (role === "staff") {
      if (!assignedTo || assignedTo !== userId) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      const keys = Object.keys(body || {});
      const allowedKeys = ["notatka_pracownika", "lista_zdjec"];
      if (keys.some((k) => !allowedKeys.includes(k))) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      const data: Record<string, unknown> = {};
      if (body.notatka_pracownika !== undefined) {
        data.workerNote = String(body.notatka_pracownika || "");
      }
      await prisma.jobStage.update({
        where: { id: stageId },
        data: data as object,
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string; stageId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId, stageId } = await params;

    const member = await requireActiveMember(companyId, userId);
    const role = (member.role || "staff") as "owner" | "admin" | "staff";
    if (!(role === "owner" || role === "admin")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    await prisma.jobStage.delete({
      where: { id: stageId },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
