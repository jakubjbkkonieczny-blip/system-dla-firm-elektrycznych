import "server-only";
import { prisma } from "@/lib/db/prisma";
import { toDashboardStatus } from "@/lib/attendance/status";
import type {
  AttendanceHistoryDay,
  AttendanceHistoryResponse,
} from "@/lib/attendance/types";
import { clampAttendanceHistoryLimit } from "@/lib/server/attendance/pagination";
import { requireOwnerOrAdmin } from "@/lib/server/attendance/require-owner-admin";
import type { ActiveMember } from "@/app/api/_lib/membership";

function serializeHistoryRow(session: {
  sessionDate: Date;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  totalWorkedMinutes: number | null;
  totalBreakMinutes: number;
}): AttendanceHistoryDay {
  return {
    date: session.sessionDate.toISOString().slice(0, 10),
    status: toDashboardStatus(session.status, true),
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    totalWorkedMinutes: session.totalWorkedMinutes ?? 0,
    totalBreakMinutes: session.totalBreakMinutes,
  };
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

  return {
    items: page.map(serializeHistoryRow),
    nextCursor,
    limit,
  };
}
