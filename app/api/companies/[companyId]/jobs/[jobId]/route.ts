import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import {
  canMemberSeeJob,
  jobWithAssignmentFields,
  normalizeAssignedToUids,
  readAssignedToUids,
  syncJobAssignments,
  validateAssignedMembers,
} from "@/lib/server/jobs/job-assignment-helpers";
import {
  hasJobDetailPatchKeys,
  parseJobDetailPatchBody,
  jobDetailPatchValidationError,
} from "@/lib/server/jobs/job-detail-fields";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

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

    return NextResponse.json(
      {
        job: jobWithAssignmentFields(job),
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

      await validateAssignedMembers(prisma, companyId, assignedToUids);

      await prisma.$transaction(async (tx) => {
        await syncJobAssignments(tx, {
          companyId,
          jobId,
          assignedToUids,
          assignedByUserId: userId,
        });
      });
    }

    const existing = await prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    if (hasJobDetailPatchKeys(body)) {
      if (!(role === "owner" || role === "admin")) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }

      const detail = parseJobDetailPatchBody(body);
      if (!detail) {
        return NextResponse.json({ error: "INVALID_PRIORITY" }, { status: 400 });
      }
      const detailErr = jobDetailPatchValidationError(detail);
      if (detailErr) {
        return NextResponse.json(
          { error: detailErr === "MISSING_FIELDS" ? "MISSING_FIELDS" : "INVALID_PREFERRED_RANGE", message: detailErr },
          { status: 400 }
        );
      }

      Object.assign(data, detail);
    }

    if (Object.keys(data).length > 0) {
      await prisma.job.update({
        where: { id: jobId },
        data: data as object,
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "INVALID_ASSIGNEES") return 403;
      return companyRouteErrorStatus(msg);
    });
  }
}
