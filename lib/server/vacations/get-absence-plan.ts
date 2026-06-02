import "server-only";
import { getMemberDisplayName } from "@/lib/company/member-labels";
import {
  formatDateFromDb,
  formatMonthParamFromParts,
  getDaysInMonth,
  getMonthLabel,
  parseMonthParam,
} from "@/lib/vacations/dates";
import type {
  AbsencePlanBar,
  AbsencePlanResponse,
  AbsencePlanRow,
} from "@/lib/vacations/types";
import type { VacationStatus, VacationType } from "@/lib/vacations/types";
import {
  findActiveCompanyMembers,
  findVacationsOverlappingMonth,
} from "@/lib/server/vacations/queries";

function toBar(
  request: {
    id: string;
    type: string;
    status: string;
    startDate: Date;
    endDate: Date;
  },
  year: number,
  month: number,
  daysInMonth: number
): AbsencePlanBar | null {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month - 1, daysInMonth));

  const start = request.startDate < monthStart ? monthStart : request.startDate;
  const end = request.endDate > monthEnd ? monthEnd : request.endDate;
  if (start > end) return null;

  const startDay = start.getUTCDate();
  const spanDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

  return {
    requestId: request.id,
    type: request.type as VacationType,
    status: request.status as VacationStatus,
    startDate: formatDateFromDb(request.startDate),
    endDate: formatDateFromDb(request.endDate),
    startDay,
    spanDays,
  };
}

export async function getAbsencePlan(params: {
  companyId: string;
  month?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
}): Promise<AbsencePlanResponse> {
  const { companyId, month, userId } = params;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(10, params.pageSize ?? 30));

  const { year, month: monthNum } = parseMonthParam(month);
  const daysInMonth = getDaysInMonth(year, monthNum);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum - 1, daysInMonth));

  const allMembers = await findActiveCompanyMembers(companyId, 500);
  const filteredMembers = userId
    ? allMembers.filter((m) => m.userId === userId)
    : allMembers;

  const totalEmployees = filteredMembers.length;
  const offset = (page - 1) * pageSize;
  const pageMembers = filteredMembers.slice(offset, offset + pageSize);
  const pageUserIds = pageMembers.map((m) => m.userId);

  const vacations = await findVacationsOverlappingMonth({
    companyId,
    monthStart,
    monthEnd,
    userId,
  });

  const byUser = new Map<string, AbsencePlanBar[]>();
  for (const v of vacations) {
    if (!pageUserIds.includes(v.userId)) continue;
    const bar = toBar(v, year, monthNum, daysInMonth);
    if (!bar) continue;
    const list = byUser.get(v.userId) ?? [];
    list.push(bar);
    byUser.set(v.userId, list);
  }

  const rows: AbsencePlanRow[] = pageMembers.map((member) => ({
    userId: member.userId,
    displayName: getMemberDisplayName(member.user),
    bars: byUser.get(member.userId) ?? [],
  }));

  return {
    month: formatMonthParamFromParts(year, monthNum),
    monthLabel: getMonthLabel(year, monthNum),
    daysInMonth,
    rows,
    page,
    pageSize,
    totalEmployees,
    hasMore: offset + pageSize < totalEmployees,
  };
}
