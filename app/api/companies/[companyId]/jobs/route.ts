import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
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
import { allocateNextJobNumber } from "@/lib/server/jobs/job-number";
import {
  parsePreferredDateTime,
  PREFERRED_RANGE_ERROR,
  toPreferredIso,
} from "@/lib/jobs/preferred-schedule";
import {
  parseJobPriorityForWrite,
  type JobPriority,
} from "@/lib/server/jobs/job-priority";
import {
  buildJobNotificationContext,
  loadCompanyName,
  notifyInitialJobAssignments,
} from "@/lib/server/notifications/job-notifications";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

type CreateJobBody = {
  customerName: string;
  customerPhone: string;
  addressCity: string;
  addressStreet: string;
  addressZip?: string;
  addressNotes?: string;
  description: string;
  preferredFrom?: string;
  preferredTo?: string;
  priority?: string;
  assignedToUids?: string[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;

    const member = await requireActiveMember(companyId, userId);

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = clamp(Number(url.searchParams.get("limit") || "50"), 1, 50);
    const cursor = url.searchParams.get("cursor");

    const where: Prisma.JobWhereInput = {
      companyId,
      deletedAt: null,
      ...(status ? { status } : {}),
    };

    const jobsRaw = await prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { assignments: { select: { userId: true } } },
    });

    const jobs = jobsRaw
      .filter((job) => canMemberSeeJob(member, userId, readAssignedToUids(job)))
      .map((job) => jobWithAssignmentFields(job));

    const nextCursor =
      jobsRaw.length === limit && jobsRaw.length > 0 ? jobsRaw[jobsRaw.length - 1].id : null;

    return NextResponse.json({ jobs, nextCursor }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;

    const member = await requireActiveMember(companyId, userId);
    const role = String(member.role || "staff");

    if (!(role === "owner" || role === "admin")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as CreateJobBody;

    const customerName = (body.customerName || "").trim();
    const customerPhone = (body.customerPhone || "").trim();
    const addressCity = (body.addressCity || "").trim();
    const addressStreet = (body.addressStreet || "").trim();
    const addressZip = (body.addressZip || "").trim();
    const addressNotes = (body.addressNotes || "").trim();
    const description = (body.description || "").trim();
    const preferredFrom = (body.preferredFrom || "").trim();
    const preferredTo = (body.preferredTo || "").trim();
    const priorityParsed = parseJobPriorityForWrite(body.priority);
    if (priorityParsed === null) {
      return NextResponse.json({ error: "INVALID_PRIORITY" }, { status: 400 });
    }
    const priority: JobPriority = priorityParsed;
    const assignedToUids = normalizeAssignedToUids(body.assignedToUids);

    if (!customerName || !customerPhone || !addressCity || !addressStreet || !description) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    const fromIso = preferredFrom ? toPreferredIso(preferredFrom) : "";
    const toIso = preferredTo ? toPreferredIso(preferredTo) : "";
    const preferredFromDate = fromIso ? parsePreferredDateTime(fromIso) : null;
    const preferredToDate = toIso ? parsePreferredDateTime(toIso) : null;

    if (
      preferredFromDate &&
      preferredToDate &&
      preferredToDate.getTime() < preferredFromDate.getTime()
    ) {
      return NextResponse.json(
        { error: "INVALID_PREFERRED_RANGE", message: PREFERRED_RANGE_ERROR },
        { status: 400 }
      );
    }

    const jobId = await prisma.$transaction(async (tx) => {
      const monthStart = startOfUtcMonth();
      const usageCount = await tx.job.count({
        where: { companyId, deletedAt: null, createdAt: { gte: monthStart } },
      });
      const monthLimit = 200;
      if (monthLimit > 0 && usageCount >= monthLimit) {
        throw new Error("LIMIT_JOBS_PER_MONTH");
      }

      await validateAssignedMembers(tx, companyId, assignedToUids);

      const jobNumber = await allocateNextJobNumber(tx, companyId);

      const j = await tx.job.create({
        data: {
          companyId,
          jobNumber,
          customerName,
          customerPhone,
          addressCity,
          addressStreet,
          addressZip: addressZip || null,
          addressNotes: addressNotes || null,
          description,
          preferredFrom: preferredFromDate,
          preferredTo: preferredToDate,
          priority,
          status: "new",
          statusUpdatedAt: new Date(),
          createdByUserId: userId,
        },
      });

      await syncJobAssignments(tx, {
        companyId,
        jobId: j.id,
        assignedToUids,
        assignedByUserId: userId,
      });

      return j.id;
    });

    const [createdJob, companyName] = await Promise.all([
      prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true, jobNumber: true, customerName: true },
      }),
      loadCompanyName(companyId),
    ]);

    if (createdJob && companyName && assignedToUids.length > 0) {
      void notifyInitialJobAssignments({
        context: buildJobNotificationContext({
          companyId,
          companyName,
          jobId: createdJob.id,
          jobNumber: createdJob.jobNumber,
          customerName: createdJob.customerName,
          actorUserId: userId,
        }),
        assignedToUids,
      });
    }

    return NextResponse.json({ jobId }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (
        msg === "LIMIT_JOBS_PER_MONTH" ||
        msg === "INVALID_ASSIGNEES" ||
        msg === "FORBIDDEN" ||
        msg === "NOT_MEMBER"
      ) {
        return 403;
      }
      return null;
    });
  }
}
