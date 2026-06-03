import "server-only";
import { getMemberDisplayName } from "@/lib/company/member-labels";
import { parseMonthParam } from "@/lib/vacations/dates";
import type { VacationType, VacationTypeUsage, VacationUtilization } from "@/lib/vacations/types";
import { prisma } from "@/lib/db/prisma";
import { sumApprovedVacationDaysByType } from "@/lib/server/vacations/sum-approved-days";

const HOURS_PER_DAY = 8;

const ALL_TYPES: VacationType[] = ["PAID", "ON_DEMAND", "UNPAID", "SICK"];

function toTypeUsageMap(daysByType: Record<VacationType, number>): Record<VacationType, VacationTypeUsage> {
  return ALL_TYPES.reduce(
    (acc, type) => {
      const days = daysByType[type] ?? 0;
      acc[type] = { days, hours: days * HOURS_PER_DAY };
      return acc;
    },
    {} as Record<VacationType, VacationTypeUsage>
  );
}

function sumUsageTotals(daysByType: Record<VacationType, number>) {
  const days = ALL_TYPES.reduce((sum, type) => sum + (daysByType[type] ?? 0), 0);
  return { days, hours: days * HOURS_PER_DAY };
}

export async function getVacationUtilization(params: {
  companyId: string;
  userId: string;
  month?: string;
}): Promise<VacationUtilization | null> {
  const { companyId, userId, month } = params;

  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId, isActive: true },
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });

  if (!member) return null;

  const { year, month: monthNum } = parseMonthParam(month);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));

  const [monthByType, yearByType] = await Promise.all([
    sumApprovedVacationDaysByType({ companyId, userId, periodStart: monthStart, periodEnd: monthEnd }),
    sumApprovedVacationDaysByType({ companyId, userId, periodStart: yearStart, periodEnd: yearEnd }),
  ]);

  const monthTotals = sumUsageTotals(monthByType);
  const yearTotals = sumUsageTotals(yearByType);

  return {
    userId,
    displayName: getMemberDisplayName(member.user),
    month: {
      ...monthTotals,
      byType: toTypeUsageMap(monthByType),
    },
    year: {
      ...yearTotals,
      byType: toTypeUsageMap(yearByType),
    },
  };
}
