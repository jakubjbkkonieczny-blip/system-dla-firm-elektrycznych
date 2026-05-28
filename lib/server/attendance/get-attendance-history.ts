import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { toDashboardStatus } from "@/lib/attendance/status";
import type {
  AttendanceHistoryDay,
  AttendanceHistoryMonthSummary,
  AttendanceHistoryResponse,
} from "@/lib/attendance/types";
import { clampAttendanceHistoryLimit } from "@/lib/server/attendance/pagination";
import { requireOwnerOrAdmin } from "@/lib/server/attendance/require-owner-admin";
import type { ActiveMember } from "@/app/api/_lib/membership";

function serializeHistoryRow(session: {
  id: string;
  sessionDate: Date;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  totalWorkedMinutes: number | null;
  totalBreakMinutes: number;
}): AttendanceHistoryDay {
  return {
    id: session.id,
    date: session.sessionDate.toISOString().slice(0, 10),
    status: toDashboardStatus(session.status, true),
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    totalWorkedMinutes: session.totalWorkedMinutes ?? 0,
    totalBreakMinutes: session.totalBreakMinutes,
  };
}

async function fetchHistoryMonthSummaries(
  companyId: string,
  filterUserId?: string
): Promise<AttendanceHistoryMonthSummary[]> {
  const userFilter = filterUserId
    ? Prisma.sql`AND "userId" = ${filterUserId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      year: number;
      month: number;
      workedMinutes: number;
      breakMinutes: number;
      workedDays: number;
    }[]
  >(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM "sessionDate")::int AS year,
      EXTRACT(MONTH FROM "sessionDate")::int AS month,
      COALESCE(SUM("totalWorkedMinutes"), 0)::int AS "workedMinutes",
      COALESCE(SUM("totalBreakMinutes"), 0)::int AS "breakMinutes",
      COUNT(*)::int AS "workedDays"
    FROM "AttendanceSession"
    WHERE "companyId" = ${companyId}
    ${userFilter}
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 DESC
  `);

  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    totalWorkedMinutes: r.workedMinutes,
    totalBreakMinutes: r.breakMinutes,
    workedDays: r.workedDays,
  }));
}

export async function getAttendanceHistory(params: {
  companyId: string;
  actorId: string;
  member: ActiveMember;
  userId?: string;
  limit?: number;
  cursor?: string;
}): Promise<AttendanceHistoryResponse> {
  const limit = clampAttendanceHistoryLimit(
    params.limit != null ? String(params.limit) : undefined
  );

  const isOwnerOrAdmin =
    params.member.role === "owner" || params.member.role === "admin";

  let filterUserId: string | undefined;

  if (isOwnerOrAdmin) {
    requireOwnerOrAdmin(params.member);
    filterUserId = params.userId?.trim() || undefined;
  } else {
    if (params.userId && params.userId !== params.actorId) {
      throw new Error("FORBIDDEN");
    }
    filterUserId = params.actorId;
  }

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      companyId: params.companyId,
      ...(filterUserId ? { userId: filterUserId } : {}),
    },
    orderBy: [{ sessionDate: "desc" }, { startedAt: "desc" }],
    take: limit + 1,
    ...(params.cursor
      ? { cursor: { id: params.cursor }, skip: 1 }
      : {}),
    select: {
      id: true,
      sessionDate: true,
      status: true,
      startedAt: true,
      endedAt: true,
      totalWorkedMinutes: true,
      totalBreakMinutes: true,
    },
  });

  const hasMore = sessions.length > limit;
  const page = hasMore ? sessions.slice(0, limit) : sessions;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  const monthSummaries = params.cursor
    ? undefined
    : await fetchHistoryMonthSummaries(params.companyId, filterUserId);

  return {
    items: page.map(serializeHistoryRow),
    nextCursor,
    limit,
    monthSummaries,
  };
}
