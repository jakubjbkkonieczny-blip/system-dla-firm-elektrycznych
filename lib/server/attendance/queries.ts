import "server-only";
import { prisma } from "@/lib/db/prisma";

const TRACKED_ROLES = ["staff", "admin"] as const;

const memberUserSelect = { id: true, email: true, displayName: true } as const;

export async function findTrackedCompanyMembers(
  companyId: string,
  userId?: string
) {
  return prisma.companyMember.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: [...TRACKED_ROLES] },
      ...(userId ? { userId } : {}),
    },
    include: { user: { select: memberUserSelect } },
    orderBy: { createdAt: "asc" },
  });
}

export async function findAttendanceSessionsForDate(
  companyId: string,
  sessionDate: Date,
  userId?: string
) {
  return prisma.attendanceSession.findMany({
    where: {
      companyId,
      sessionDate,
      ...(userId ? { userId } : {}),
    },
    include: { user: { select: memberUserSelect } },
  });
}
