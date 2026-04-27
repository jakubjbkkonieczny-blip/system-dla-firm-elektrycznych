import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import type { ActiveMember } from "@/app/api/_lib/membership";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

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

function canMemberSeeJob(member: ActiveMember, userId: string, assignedIds: string[]) {
  const role = String(member.role || "staff");
  const scope = String(member.scope || "all");
  if (role === "owner" || role === "admin") return true;
  return assignedIds.includes(userId) || scope === "all";
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
  priority?: "normal" | "urgent";
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
    const todo = url.searchParams.get("todo") === "1";
    const limit = clamp(Number(url.searchParams.get("limit") || "50"), 1, 50);
    const cursor = url.searchParams.get("cursor");

    const where: Prisma.JobWhereInput = {
      companyId,
      deletedAt: null,
      ...(todo
        ? { status: { in: ["new", "scheduled", "in_progress"] } }
        : status
          ? { status }
          : {}),
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
      .map((job) => {
        const assignedToUids = readAssignedToUids(job);
        const { assignments, ...rest } = job;
        return {
          ...rest,
          assignedToUids,
          assignedTo: assignedToUids[0] || null,
        };
      });

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
    const priority = body.priority === "urgent" ? "urgent" : "normal";
    const assignedToUids = normalizeAssignedToUids(body.assignedToUids);

    if (!customerName || !customerPhone || !addressCity || !addressStreet || !description) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
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

      if (assignedToUids.length > 0) {
        const valid = await tx.companyMember.count({
          where: {
            companyId,
            userId: { in: assignedToUids },
            isActive: true,
          },
        });
        if (valid !== assignedToUids.length) {
          throw new Error("INVALID_ASSIGNEES");
        }
      }

      const j = await tx.job.create({
        data: {
          companyId,
          customerName,
          customerPhone,
          addressCity,
          addressStreet,
          addressZip: addressZip || null,
          addressNotes: addressNotes || null,
          description,
          preferredFrom: preferredFrom ? new Date(preferredFrom) : null,
          preferredTo: preferredTo ? new Date(preferredTo) : null,
          priority,
          status: "new",
          statusUpdatedAt: new Date(),
          createdByUserId: userId,
        },
      });

      for (const assigneeId of assignedToUids) {
        await tx.jobAssignment.create({
          data: {
            companyId,
            jobId: j.id,
            userId: assigneeId,
            assignedByUserId: userId,
          },
        });
      }

      return j.id;
    });

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
