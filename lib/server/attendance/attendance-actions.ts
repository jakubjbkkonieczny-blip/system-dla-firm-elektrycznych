import "server-only";
import { prisma } from "@/lib/db/prisma";
import { finalizeWorkedMinutes } from "@/lib/attendance/duration";
import { formatTimeHm } from "@/lib/attendance/dates";
import type {
  AttendanceAction,
  AttendanceActionResponse,
  AttendanceEmployeeState,
  AttendanceMeResponse,
} from "@/lib/attendance/types";
import { todaySessionDate } from "@/lib/server/attendance/session-date";

type SessionRow = {
  id: string;
  status: string;
  sessionDate: Date;
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
  totalBreakMinutes: number;
  totalWorkedMinutes: number | null;
  locationText: string | null;
};

function availableActions(state: AttendanceEmployeeState): AttendanceAction[] {
  if (state === "not_started") return ["start_work"];
  if (state === "working") return ["start_break", "finish_work"];
  if (state === "on_break") return ["end_break"];
  return [];
}

export function serializeMeResponse(
  session: SessionRow | null,
  sessionDate: Date
): AttendanceMeResponse {
  const state: AttendanceEmployeeState = session
    ? session.status === "break" || session.status === "on_break"
      ? "on_break"
      : (session.status as AttendanceEmployeeState)
    : "not_started";

  return {
    sessionDate: sessionDate.toISOString().slice(0, 10),
    state,
    startedAt: session?.startedAt?.toISOString() ?? null,
    breakStartedAt: session?.breakStartedAt?.toISOString() ?? null,
    endedAt: session?.endedAt?.toISOString() ?? null,
    totalBreakMinutes: session?.totalBreakMinutes ?? 0,
    totalWorkedMinutes: session?.totalWorkedMinutes ?? null,
    locationText: session?.locationText ?? null,
    sessionId: session?.id ?? null,
    availableActions: availableActions(state),
  };
}

export async function getTodayAttendanceMe(
  companyId: string,
  userId: string
): Promise<AttendanceMeResponse> {
  const sessionDate = todaySessionDate();
  const session = await prisma.attendanceSession.findUnique({
    where: {
      companyId_userId_sessionDate: {
        companyId,
        userId,
        sessionDate,
      },
    },
  });
  return serializeMeResponse(session, sessionDate);
}

export async function performAttendanceAction(params: {
  companyId: string;
  userId: string;
  action: AttendanceAction;
  locationText?: string;
}): Promise<AttendanceActionResponse> {
  const sessionDate = todaySessionDate();
  const now = new Date();
  const sessionKey = {
    companyId: params.companyId,
    userId: params.userId,
    sessionDate,
  };

  let session = await prisma.attendanceSession.findUnique({
    where: { companyId_userId_sessionDate: sessionKey },
  });

  let message = "Dziękujemy 👍";

  if (params.action === "start_work") {
    if (session?.status === "finished") {
      throw new Error("ALREADY_FINISHED");
    }
    if (session?.startedAt && session.status !== "not_started") {
      throw new Error("ALREADY_STARTED");
    }
    session = await prisma.attendanceSession.upsert({
      where: { companyId_userId_sessionDate: sessionKey },
      create: {
        companyId: params.companyId,
        userId: params.userId,
        sessionDate,
        status: "working",
        startedAt: now,
        locationText: params.locationText?.trim() || null,
      },
      update: {
        status: "working",
        startedAt: session?.startedAt ?? now,
        locationText: params.locationText?.trim() || session?.locationText || null,
      },
    });
    message = `Rozpoczęto pracę o ${formatTimeHm(now.toISOString())}`;
  } else if (!session?.startedAt) {
    throw new Error("NOT_STARTED");
  } else if (params.action === "start_break") {
    if (session.status !== "working") throw new Error("INVALID_STATE");
    session = await prisma.attendanceSession.update({
      where: { id: session.id },
      data: { status: "break", breakStartedAt: now },
    });
    message = `Rozpoczęto przerwę o ${formatTimeHm(now.toISOString())}`;
  } else if (params.action === "end_break") {
    if (session.status !== "on_break" && session.status !== "break") {
      throw new Error("INVALID_STATE");
    }
    if (!session.breakStartedAt) throw new Error("NO_BREAK_START");
    const breakMins = Math.floor(
      (now.getTime() - session.breakStartedAt.getTime()) / 60_000
    );
    session = await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        status: "working",
        breakStartedAt: null,
        totalBreakMinutes: session.totalBreakMinutes + Math.max(0, breakMins),
      },
    });
    message = `Zakończono przerwę o ${formatTimeHm(now.toISOString())}`;
  } else if (params.action === "finish_work") {
    if (session.status !== "working") throw new Error("INVALID_STATE");
    const worked = finalizeWorkedMinutes(
      {
        status: "working",
        startedAt: session.startedAt,
        breakStartedAt: null,
        endedAt: null,
        totalBreakMinutes: session.totalBreakMinutes,
        totalWorkedMinutes: null,
        now,
      },
      now
    );
    session = await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        status: "finished",
        endedAt: now,
        totalWorkedMinutes: worked,
        breakStartedAt: null,
      },
    });
    message = `Zakończono pracę o ${formatTimeHm(now.toISOString())}`;
  }

  return {
    ok: true,
    message,
    session: serializeMeResponse(session, sessionDate),
  };
}
