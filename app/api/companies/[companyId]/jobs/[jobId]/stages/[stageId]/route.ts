import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string; jobId: string; stageId: string }> };

function isYyyyMmDd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId, stageId } = await params;

    const me = await requireActiveMember(companyId, userId);
    const isAdmin = me.role === "owner" || me.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const body = (await req.json()) as {
      nazwa_etapu?: string;
      opis_etapu?: string;
      planowana_data?: string;
    };

    const data: Record<string, unknown> = {};
    if (typeof body.nazwa_etapu === "string") {
      const v = body.nazwa_etapu.trim();
      if (!v) return NextResponse.json({ error: "MISSING_STAGE_NAME" }, { status: 400 });
      data.name = v;
    }
    if (typeof body.opis_etapu === "string") {
      data.description = body.opis_etapu.trim() || null;
    }
    if (typeof body.planowana_data === "string") {
      const d = body.planowana_data.trim();
      if (d && !isYyyyMmDd(d)) return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
      data.plannedDate = d ? new Date(`${d}T00:00:00.000Z`) : null;
    }

    const existing = await prisma.jobStage.findFirst({
      where: { id: stageId, companyId, jobId },
    });
    if (!existing) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    await prisma.jobStage.update({
      where: { id: stageId },
      data: data as object,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId, stageId } = await params;

    const me = await requireActiveMember(companyId, userId);
    const isAdmin = me.role === "owner" || me.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const existing = await prisma.jobStage.findFirst({
      where: { id: stageId, companyId, jobId },
    });
    if (!existing) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    await prisma.jobStage.delete({ where: { id: stageId } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
