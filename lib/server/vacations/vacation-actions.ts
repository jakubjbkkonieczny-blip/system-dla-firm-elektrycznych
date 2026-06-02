import "server-only";
import { prisma } from "@/lib/db/prisma";
import { computeInclusiveDays, dateToUtcDate } from "@/lib/vacations/dates";
import type { VacationType } from "@/lib/vacations/types";

const VALID_TYPES: VacationType[] = ["PAID", "ON_DEMAND", "UNPAID", "SICK"];

function assertValidType(type: string): VacationType {
  if (!VALID_TYPES.includes(type as VacationType)) {
    throw new Error("INVALID_TYPE");
  }
  return type as VacationType;
}

function assertValidDates(startDate: string, endDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("INVALID_DATES");
  }
  if (endDate < startDate) {
    throw new Error("INVALID_DATE_RANGE");
  }
}

async function assertMemberOfCompany(companyId: string, userId: string): Promise<void> {
  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId, isActive: true },
  });
  if (!member) throw new Error("INVALID_EMPLOYEE");
}

export async function createVacationRequest(params: {
  companyId: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}) {
  const type = assertValidType(params.type);
  assertValidDates(params.startDate, params.endDate);
  await assertMemberOfCompany(params.companyId, params.userId);

  const totalDays = computeInclusiveDays(params.startDate, params.endDate);

  return prisma.vacationRequest.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      type,
      startDate: dateToUtcDate(params.startDate),
      endDate: dateToUtcDate(params.endDate),
      totalDays,
      status: "PENDING",
      reason: params.reason?.trim() || null,
    },
  });
}

export async function decideVacationRequest(params: {
  companyId: string;
  requestId: string;
  action: "approve" | "reject";
  decidedById: string;
}) {
  const request = await prisma.vacationRequest.findFirst({
    where: { id: params.requestId, companyId: params.companyId },
  });

  if (!request) throw new Error("NOT_FOUND");
  if (request.status !== "PENDING") throw new Error("ALREADY_DECIDED");

  const status = params.action === "approve" ? "APPROVED" : "REJECTED";

  return prisma.vacationRequest.update({
    where: { id: request.id },
    data: {
      status,
      decidedById: params.decidedById,
      decidedAt: new Date(),
    },
  });
}
