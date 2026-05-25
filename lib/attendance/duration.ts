export function formatWorkDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0 || !Number.isFinite(ms)) return "—";
  return formatMinutes(Math.floor(ms / 60_000));
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0 || !Number.isFinite(minutes)) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function minutesToMs(minutes: number): number {
  return minutes * 60_000;
}

type SessionDurationInput = {
  status: string;
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
  totalBreakMinutes: number;
  totalWorkedMinutes: number | null;
  now?: Date;
};

/** Worked time excluding breaks (minutes). */
export function computeWorkedMinutes(session: SessionDurationInput): number | null {
  const { startedAt, now = new Date() } = session;
  if (!startedAt) return null;

  if (session.totalWorkedMinutes != null && session.status === "finished") {
    return session.totalWorkedMinutes;
  }

  const end = session.endedAt ?? now;
  let grossMs = end.getTime() - startedAt.getTime();
  if (grossMs <= 0) return 0;

  let breakMs = session.totalBreakMinutes * 60_000;
  if (
    (session.status === "on_break" || session.status === "break") &&
    session.breakStartedAt
  ) {
    breakMs += now.getTime() - session.breakStartedAt.getTime();
  }

  const net = Math.max(0, grossMs - breakMs);
  return Math.floor(net / 60_000);
}

export function computeBreakMinutes(session: SessionDurationInput): number {
  const { now = new Date() } = session;
  let mins = session.totalBreakMinutes;
  if (
    (session.status === "on_break" || session.status === "break") &&
    session.breakStartedAt
  ) {
    mins += Math.floor((now.getTime() - session.breakStartedAt.getTime()) / 60_000);
  }
  return mins;
}

export function computeWorkDurationMs(session: SessionDurationInput): number | null {
  const mins = computeWorkedMinutes(session);
  if (mins == null) return null;
  return minutesToMs(mins);
}

export function computeBreakDurationMs(session: SessionDurationInput): number | null {
  if (!session.startedAt) return null;
  return minutesToMs(computeBreakMinutes(session));
}

/** Finalize totalWorkedMinutes on finish. */
export function finalizeWorkedMinutes(session: SessionDurationInput, at: Date = new Date()): number {
  return computeWorkedMinutes({ ...session, endedAt: at, status: "finished", now: at }) ?? 0;
}
