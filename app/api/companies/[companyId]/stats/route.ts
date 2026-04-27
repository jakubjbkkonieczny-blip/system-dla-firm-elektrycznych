import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string }> };

function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;

    await requireActiveMember(companyId, userId);

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const baseWhere = { companyId, deletedAt: null as const };

    const [newC, schC, progC, doneC, cancC, membersActive, membersTotal, jobsUsed] =
      await Promise.all([
        prisma.job.count({ where: { ...baseWhere, status: "new" } }),
        prisma.job.count({ where: { ...baseWhere, status: "scheduled" } }),
        prisma.job.count({ where: { ...baseWhere, status: "in_progress" } }),
        prisma.job.count({ where: { ...baseWhere, status: "done" } }),
        prisma.job.count({ where: { ...baseWhere, status: "cancelled" } }),
        prisma.companyMember.count({ where: { companyId, isActive: true } }),
        prisma.companyMember.count({ where: { companyId } }),
        prisma.job.count({
          where: {
            companyId,
            deletedAt: null,
            createdAt: { gte: startOfUtcMonth() },
          },
        }),
      ]);

    const jobsLimit = 200;

    return NextResponse.json(
      {
        ok: true,
        stats: {
          jobs: {
            new: newC,
            scheduled: schC,
            in_progress: progC,
            done: doneC,
            cancelled: cancC,
          },
          members: {
            active: membersActive,
            total: membersTotal,
          },
          usage: { jobsUsed, jobsLimit },
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
