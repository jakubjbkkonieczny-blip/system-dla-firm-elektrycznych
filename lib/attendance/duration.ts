export function formatWorkDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0 || !Number.isFinite(ms)) return "—";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function computeWorkDurationMs(params: {
  status: string;
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
  now?: Date;
}): number | null {
  const { status, startedAt, breakStartedAt, endedAt, now = new Date() } = params;
  if (!startedAt) return null;

  const end =
    status === "finished" && endedAt
      ? endedAt
      : status === "break" && breakStartedAt
        ? breakStartedAt
        : status === "working"
          ? now
          : endedAt ?? null;

  if (!end) return null;
  const ms = end.getTime() - startedAt.getTime();
  return ms > 0 ? ms : 0;
}
