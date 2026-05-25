import "server-only";
import { prisma } from "@/lib/db/prisma";
import { parseAttendanceDateParam } from "@/lib/attendance/dates";
import { computeWorkedMinutes } from "@/lib/attendance/duration";
import type { AttendanceHoursSummary, AttendanceHistoryDay } from "@/lib/attendance/types";
import { getMemberDisplayName } from "@/lib/company/member-labels";
import { getAttendanceHistory } from "@/lib/server/attendance/get-attendance-history";
import { monthRangeUtc, weekRangeUtc } from "@/lib/server/attendance/session-date";

function sumWorkedMinutes(
  sessions: { totalWorkedMinutes: number | null; startedAt: Date | null; endedAt: Date | null; status: string; totalBreakMinutes: number; breakStartedAt: Date | null }[]
): number {
  return sessions.reduce((acc, s) => {
    if (s.totalWorkedMinutes != null) return acc + s.totalWorkedMinutes;
    return acc;
  }, 0);
}

export async function getAttendanceHoursSummary(params: {
  companyId: string;
  userId: string;
  actorId: string;
  member: { role: string; scope: string | null; userId: string; isActive: boolean };
  date?: string;
}): Promise<AttendanceHoursSummary> {
  const refDate =
    (params.date && parseAttendanceDateParam(params.date)) || parseAttendanceDateParam(
      new Date().toISOString().slice(0, 10)
    )!;

  const member = await prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId: params.companyId, userId: params.userId } },
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });
  if (!member) throw new Error("MEMBER_NOT_FOUND");

  const week = weekRangeUtc(refDate);
  const month = monthRangeUtc(refDate);

  const [todaySession, weekSessions, monthSessions, historyPage] = await Promise.all([
    prisma.attendanceSession.findUnique({
      where: {
        companyId_userId_sessionDate: {
          companyId: params.companyId,
          userId: params.userId,
          sessionDate: refDate,
        },
      },
    }),
    prisma.attendanceSession.findMany({
      where: {
        companyId: params.companyId,
        userId: params.userId,
        sessionDate: { gte: week.start, lt: week.end },
      },
    }),
    prisma.attendanceSession.findMany({
      where: {
        companyId: params.companyId,
        userId: params.userId,
        sessionDate: { gte: month.start, lt: month.end },
      },
    }),
    getAttendanceHistory({
      companyId: params.companyId,
      actorId: params.actorId,
      member: params.member,
      userId: params.userId,
      limit: 14,
    }),
  ]);

  const history: AttendanceHistoryDay[] = historyPage.items;

  return {
    userId: member.userId,
    displayName: getMemberDisplayName({
      displayName: member.user.displayName,
      email: member.user.email,
    }),
    email: member.user.email,
    date: refDate.toISOString().slice(0, 10),
    todayWorkedMinutes: todaySession
      ? (todaySession.totalWorkedMinutes ??
        computeWorkedMinutes({
          status: todaySession.status,
          startedAt: todaySession.startedAt,
          breakStartedAt: todaySession.breakStartedAt,
          endedAt: todaySession.endedAt,
          totalBreakMinutes: todaySession.totalBreakMinutes,
          totalWorkedMinutes: todaySession.totalWorkedMinutes,
        }) ??
        0)
      : 0,
    todayBreakMinutes: todaySession?.totalBreakMinutes ?? 0,
    weekWorkedMinutes: sumWorkedMinutes(weekSessions),
    monthWorkedMinutes: sumWorkedMinutes(monthSessions),
    history,
  };
}
