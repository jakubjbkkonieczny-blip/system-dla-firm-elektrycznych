import "server-only";
import { parseAttendanceDateParam, formatAttendanceDateInput } from "@/lib/attendance/dates";
import {
  computeBreakDurationMs,
  computeWorkDurationMs,
} from "@/lib/attendance/duration";
import { toDashboardStatus } from "@/lib/attendance/status";
import type {
  AttendanceDashboardResponse,
  AttendanceDashboardRow,
  AttendanceDashboardStatus,
  AttendanceEmployeeRef,
  AttendanceSummary,
} from "@/lib/attendance/types";
import { getMemberDisplayName } from "@/lib/company/member-labels";
import {
  findAttendanceSessionsForDate,
  findTrackedCompanyMembers,
} from "@/lib/server/attendance/queries";

function employeeRef(user: {
  id: string;
  email: string;
  displayName: string | null;
}): AttendanceEmployeeRef {
  return {
    userId: user.id,
    displayName: getMemberDisplayName({
      displayName: user.displayName,
      email: user.email,
    }),
    email: user.email,
  };
}

function serializeSessionRow(
  session: {
    id: string;
    userId: string;
    status: string;
    startedAt: Date | null;
    breakStartedAt: Date | null;
    endedAt: Date | null;
    totalBreakMinutes: number;
    totalWorkedMinutes: number | null;
    locationText: string | null;
    user: { id: string; email: string; displayName: string | null };
  },
  now: Date
): AttendanceDashboardRow {
  const status = toDashboardStatus(session.status, true);
  const ref = employeeRef(session.user);
  const durationInput = {
    status: session.status,
    startedAt: session.startedAt,
    breakStartedAt: session.breakStartedAt,
    endedAt: session.endedAt,
    totalBreakMinutes: session.totalBreakMinutes,
    totalWorkedMinutes: session.totalWorkedMinutes,
    now,
  };

  return {
    userId: ref.userId,
    displayName: ref.displayName,
    email: ref.email,
    status,
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    workDurationMs: computeWorkDurationMs(durationInput),
    breakDurationMs: computeBreakDurationMs(durationInput),
    locationText: session.locationText,
    sessionId: session.id,
  };
}

function absentRow(user: {
  id: string;
  email: string;
  displayName: string | null;
}): AttendanceDashboardRow {
  const ref = employeeRef(user);
  return {
    userId: ref.userId,
    displayName: ref.displayName,
    email: ref.email,
    status: "absent",
    startedAt: null,
    endedAt: null,
    workDurationMs: null,
    breakDurationMs: null,
    locationText: null,
    sessionId: null,
  };
}

function buildSummary(rows: AttendanceDashboardRow[]): AttendanceSummary {
  const summary: AttendanceSummary = {
    working: 0,
    break: 0,
    finished: 0,
    absent: 0,
    total: rows.length,
  };
  for (const row of rows) {
    if (row.status === "working") summary.working++;
    else if (row.status === "break") summary.break++;
    else if (row.status === "finished") summary.finished++;
    else if (row.status === "absent") summary.absent++;
  }
  return summary;
}

function statusMatchesFilter(
  dashboardStatus: AttendanceDashboardStatus,
  filter: string
): boolean {
  if (filter === "break") return dashboardStatus === "break";
  return dashboardStatus === filter;
}

export async function getAttendanceDashboard(params: {
  companyId: string;
  date?: string;
  userId?: string;
  status?: string;
}): Promise<AttendanceDashboardResponse> {
  // Day-based: one sessionDate per calendar day; default = today (no midnight job).
  const dateStr = params.date?.trim() || formatAttendanceDateInput(new Date());
  const sessionDate =
    parseAttendanceDateParam(dateStr) ??
    parseAttendanceDateParam(formatAttendanceDateInput(new Date()))!;
  const now = new Date();

  const [members, sessions] = await Promise.all([
    findTrackedCompanyMembers(params.companyId, params.userId),
    findAttendanceSessionsForDate(params.companyId, sessionDate, params.userId),
  ]);

  const employees: AttendanceEmployeeRef[] = members.map((m) => employeeRef(m.user));
  const sessionByUser = new Map(sessions.map((s) => [s.userId, s]));

  let rows: AttendanceDashboardRow[] = members.map((m) => {
    const session = sessionByUser.get(m.userId);
    if (session) return serializeSessionRow(session, now);
    return absentRow(m.user);
  });

  if (params.status) {
    const statusFilter = params.status;
    rows = rows.filter((r) => statusMatchesFilter(r.status, statusFilter));
  }

  return {
    date: dateStr,
    summary: buildSummary(rows),
    rows,
    employees,
  };
}
