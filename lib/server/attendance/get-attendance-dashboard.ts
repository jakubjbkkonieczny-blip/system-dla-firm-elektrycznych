import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildDemoAttendanceRows } from "@/lib/attendance/demo-data";
import { parseAttendanceDateParam, formatAttendanceDateInput } from "@/lib/attendance/dates";
import { computeWorkDurationMs } from "@/lib/attendance/duration";
import { toAttendancePhotoView } from "@/lib/attendance/photos";
import type {
  AttendanceDashboardResponse,
  AttendanceDashboardRow,
  AttendanceEmployeeRef,
  AttendanceStatus,
  AttendanceSummary,
} from "@/lib/attendance/types";
import { getMemberDisplayName } from "@/lib/company/member-labels";

const TRACKED_ROLES = ["staff", "admin"] as const;

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
    checkInPhotoUrl: string | null;
    checkInPhotoExpiresAt: Date | null;
    checkOutPhotoUrl: string | null;
    checkOutPhotoExpiresAt: Date | null;
    locationText: string | null;
    user: { id: string; email: string; displayName: string | null };
  },
  now: Date
): AttendanceDashboardRow {
  const status = session.status as AttendanceStatus;
  const ref = employeeRef(session.user);

  return {
    userId: ref.userId,
    displayName: ref.displayName,
    email: ref.email,
    status,
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    workDurationMs: computeWorkDurationMs({
      status,
      startedAt: session.startedAt,
      breakStartedAt: session.breakStartedAt,
      endedAt: session.endedAt,
      now,
    }),
    locationText: session.locationText,
    checkInPhoto: toAttendancePhotoView(
      session.checkInPhotoUrl,
      session.checkInPhotoExpiresAt,
      now
    ),
    checkOutPhoto: toAttendancePhotoView(
      session.checkOutPhotoUrl,
      session.checkOutPhotoExpiresAt,
      now
    ),
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
    locationText: null,
    checkInPhoto: { url: null, expired: false },
    checkOutPhoto: { url: null, expired: false },
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

export async function getAttendanceDashboard(params: {
  companyId: string;
  date?: string;
  userId?: string;
  status?: string;
  demo?: boolean;
}): Promise<AttendanceDashboardResponse> {
  const sessionDate =
    (params.date && parseAttendanceDateParam(params.date)) ||
    parseAttendanceDateParam(formatAttendanceDateInput(new Date()))!;

  const dateStr = params.date?.trim() || formatAttendanceDateInput(new Date());
  const now = new Date();

  const members = await prisma.companyMember.findMany({
    where: {
      companyId: params.companyId,
      isActive: true,
      role: { in: [...TRACKED_ROLES] },
      ...(params.userId ? { userId: params.userId } : {}),
    },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const employees: AttendanceEmployeeRef[] = members.map((m) => employeeRef(m.user));

  if (params.demo) {
    let rows = buildDemoAttendanceRows(employees, sessionDate);
    if (params.status) {
      rows = rows.filter((r) => r.status === params.status);
    }
    return {
      date: dateStr,
      summary: buildSummary(rows),
      rows,
      employees,
    };
  }

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      companyId: params.companyId,
      sessionDate,
      ...(params.userId ? { userId: params.userId } : {}),
    },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
    },
  });

  const sessionByUser = new Map(sessions.map((s) => [s.userId, s]));

  let rows: AttendanceDashboardRow[] = members.map((m) => {
    const session = sessionByUser.get(m.userId);
    if (session) return serializeSessionRow(session, now);
    return absentRow(m.user);
  });

  if (params.status) {
    rows = rows.filter((r) => r.status === params.status);
  }

  return {
    date: dateStr,
    summary: buildSummary(rows),
    rows,
    employees,
  };
}
