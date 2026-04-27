import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

function normalizeAssignedToUids(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = input
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return Array.from(new Set(out));
}

function readAssignedToUids(job: { assignments: { userId: string }[] }): string[] {
  return job.assignments.map((a) => a.userId);
}

function canMemberSeeJob(
  member: { role: string; scope: string | null },
  userId: string,
  assignedIds: string[]
) {
  const role = String(member.role || "staff");
  const scope = String(member.scope || "all");
  if (role === "owner" || role === "admin") return true;
  return assignedIds.includes(userId) || scope === "all";
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId } = await params;

    const member = await requireActiveMember(companyId, userId);

    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      include: { assignments: { select: { userId: true } } },
    });

    if (!job) {
      return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const assignedToUids = readAssignedToUids(job);
    if (!canMemberSeeJob(member, userId, assignedToUids)) {
      return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const { assignments, ...rest } = job;

    return NextResponse.json(
      {
        job: {
          ...rest,
          assignedToUids,
          assignedTo: assignedToUids[0] || null,
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, jobId } = await params;

    const member = await requireActiveMember(companyId, userId);
    const role = String(member.role || "staff");

    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof body.status === "string") {
      data.status = body.status;
      data.statusUpdatedAt = new Date();
    }

    if (body.assignedToUids !== undefined) {
      if (!(role === "owner" || role === "admin")) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }

      const assignedToUids = normalizeAssignedToUids(body.assignedToUids);
      await prisma.$transaction(async (tx) => {
        await tx.jobAssignment.deleteMany({ where: { jobId } });
        for (const assigneeId of assignedToUids) {
          await tx.jobAssignment.create({
            data: {
              companyId,
              jobId,
              userId: assigneeId,
              assignedByUserId: userId,
            },
          });
        }
      });
    }

    const existing = await prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    if (Object.keys(data).length > 0) {
      await prisma.job.update({
        where: { id: jobId },
        data: data as object,
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
