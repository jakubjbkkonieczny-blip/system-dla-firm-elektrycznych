import "server-only";

export const ATTENDANCE_HISTORY_MAX_LIMIT = 50;

export function clampAttendanceHistoryLimit(raw: string | null | undefined): number {
  const n = Number(raw ?? "20");
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(ATTENDANCE_HISTORY_MAX_LIMIT, Math.floor(n)));
}
