import "server-only";
import { prisma } from "@/lib/db/prisma";

const memberUserSelect = { id: true, email: true, displayName: true } as const;

export async function findActiveCompanyMembers(companyId: string, take = 200) {
  return prisma.companyMember.findMany({
    where: { companyId, isActive: true },
    orderBy: { createdAt: "asc" },
    take,
    include: { user: { select: memberUserSelect } },
  });
}

export async function findCompanyVacationRequests(params: {
  companyId: string;
  status?: string;
  userId?: string;
  limit?: number;
}) {
  const { companyId, status, userId, limit = 100 } = params;

  return prisma.vacationRequest.findMany({
    where: {
      companyId,
      ...(status ? { status } : {}),
      ...(userId ? { userId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    include: {
      user: { select: memberUserSelect },
    },
  });
}

export async function findVacationsOverlappingMonth(params: {
  companyId: string;
  monthStart: Date;
  monthEnd: Date;
  userId?: string;
}) {
  const { companyId, monthStart, monthEnd, userId } = params;

  return prisma.vacationRequest.findMany({
    where: {
      companyId,
      ...(userId ? { userId } : {}),
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
    orderBy: [{ startDate: "asc" }],
    include: {
      user: { select: memberUserSelect },
    },
  });
}

export async function findTodayApprovedAbsences(companyId: string, today: Date) {
  return prisma.vacationRequest.findMany({
    where: {
      companyId,
      status: "APPROVED",
      startDate: { lte: today },
      endDate: { gte: today },
    },
    orderBy: [{ startDate: "asc" }],
    include: {
      user: { select: memberUserSelect },
    },
  });
}

export async function countVacationsByStatus(companyId: string) {
  const [pending, approved, rejected] = await Promise.all([
    prisma.vacationRequest.count({ where: { companyId, status: "PENDING" } }),
    prisma.vacationRequest.count({ where: { companyId, status: "APPROVED" } }),
    prisma.vacationRequest.count({ where: { companyId, status: "REJECTED" } }),
  ]);

  return { pending, approved, rejected };
}
