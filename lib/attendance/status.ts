import type { AttendanceDashboardStatus, AttendanceEmployeeState } from "@/lib/attendance/types";

/** Map DB status to owner/admin dashboard badge status. */
export function toDashboardStatus(
  dbStatus: string | null | undefined,
  hasSession: boolean
): AttendanceDashboardStatus {
  if (!hasSession) return "absent";
  const s = (dbStatus || "").toLowerCase();
  if (s === "on_break" || s === "break") return "break";
  if (s === "working") return "working";
  if (s === "finished") return "finished";
  if (s === "not_started") return "absent";
  return "absent";
}

export function normalizeDbStatus(status: string): AttendanceEmployeeState | string {
  if (status === "break") return "on_break";
  return status as AttendanceEmployeeState;
}

export function isOnBreakStatus(status: string): boolean {
  const s = normalizeDbStatus(status);
  return s === "on_break";
}

export function isWorkingStatus(status: string): boolean {
  return normalizeDbStatus(status) === "working";
}
