import "server-only";
import { getMemberDisplayName } from "@/lib/company/member-labels";
import {
  formatDateFromDb,
  formatMonthParamFromParts,
  getMonthLabel,
  parseMonthParam,
} from "@/lib/vacations/dates";
import type {
  EmployeeVacationDashboardResponse,
  VacationRequestRow,
  VacationStatus,
  VacationType,
} from "@/lib/vacations/types";
import { findCompanyVacationRequests } from "@/lib/server/vacations/queries";
import {
  sumApprovedVacationDaysByType,
  sumApprovedVacationDaysInRange,
} from "@/lib/server/vacations/sum-approved-days";

const HOURS_PER_DAY = 8;

function serializeOwnRequest(row: {
  id: string;
  userId: string;
  type: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  status: string;
  reason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  user: { id: string; email: string; displayName: string | null };
}): VacationRequestRow {
  return {
    id: row.id,
    userId: row.userId,
    displayName: getMemberDisplayName(row.user),
    email: row.user.email,
    type: row.type as VacationType,
    startDate: formatDateFromDb(row.startDate),
    endDate: formatDateFromDb(row.endDate),
    totalDays: row.totalDays,
    status: row.status as VacationStatus,
    reason: row.reason,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getEmployeeVacationDashboard(params: {
  companyId: string;
  userId: string;
  month?: string;
  status?: string;
}): Promise<EmployeeVacationDashboardResponse> {
  const { companyId, userId, month, status } = params;

  const { year, month: monthNum } = parseMonthParam(month);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));

  const [monthDays, yearDays, yearBreakdown, requests] = await Promise.all([
    sumApprovedVacationDaysInRange({ companyId, userId, periodStart: monthStart, periodEnd: monthEnd }),
    sumApprovedVacationDaysInRange({ companyId, userId, periodStart: yearStart, periodEnd: yearEnd }),
    sumApprovedVacationDaysByType({ companyId, userId, periodStart: yearStart, periodEnd: yearEnd }),
    findCompanyVacationRequests({ companyId, userId, status, limit: 100 }),
  ]);

  return {
    month: formatMonthParamFromParts(year, monthNum),
    monthLabel: getMonthLabel(year, monthNum),
    usedMonth: { days: monthDays, hours: monthDays * HOURS_PER_DAY },
    usedYear: { days: yearDays, hours: yearDays * HOURS_PER_DAY },
    yearBreakdown,
    requests: requests.map(serializeOwnRequest),
  };
}
