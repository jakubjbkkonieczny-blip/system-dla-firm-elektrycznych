import "server-only";
import { getMemberDisplayName } from "@/lib/company/member-labels";
import { formatDateFromDb } from "@/lib/vacations/dates";
import type {
  VacationDashboardResponse,
  VacationRequestRow,
  VacationStatus,
  VacationType,
} from "@/lib/vacations/types";
import {
  countVacationsByStatus,
  findActiveCompanyMembers,
  findCompanyVacationRequests,
  findTodayApprovedAbsences,
} from "@/lib/server/vacations/queries";
import { getVacationUtilization } from "@/lib/server/vacations/get-vacation-utilization";

function serializeRequest(row: {
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

export async function getVacationsDashboard(params: {
  companyId: string;
  status?: string;
  userId?: string;
  utilizationUserId?: string;
  month?: string;
}): Promise<VacationDashboardResponse> {
  const { companyId, status, userId, utilizationUserId, month } = params;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [counts, requests, todayAbsences, members, utilization] = await Promise.all([
    countVacationsByStatus(companyId),
    findCompanyVacationRequests({ companyId, status, userId, limit: 100 }),
    findTodayApprovedAbsences(companyId, today),
    findActiveCompanyMembers(companyId),
    utilizationUserId
      ? getVacationUtilization({ companyId, userId: utilizationUserId, month })
      : Promise.resolve(null),
  ]);

  return {
    summary: {
      pending: counts.pending,
      approved: counts.approved,
      rejected: counts.rejected,
      absentToday: todayAbsences.length,
    },
    requests: requests.map(serializeRequest),
    todayAbsences: todayAbsences.map((row) => ({
      id: row.id,
      userId: row.userId,
      displayName: getMemberDisplayName(row.user),
      type: row.type as VacationType,
      startDate: formatDateFromDb(row.startDate),
      endDate: formatDateFromDb(row.endDate),
    })),
    employees: members.map((m) => ({
      userId: m.userId,
      displayName: getMemberDisplayName(m.user),
      email: m.user.email,
    })),
    utilization,
  };
}
