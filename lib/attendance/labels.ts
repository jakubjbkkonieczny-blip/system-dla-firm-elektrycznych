import type { AttendanceDashboardStatus } from "@/lib/attendance/types";

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceDashboardStatus, string> = {
  working: "W pracy",
  break: "Na przerwie",
  finished: "Zakończył",
  absent: "Nieobecny",
};

export const ATTENDANCE_STATUS_COLORS: Record<
  AttendanceDashboardStatus,
  { bg: string; text: string; border: string; card: string }
> = {
  working: {
    bg: "bg-success-bg",
    text: "text-success",
    border: "border-success-border",
    card: "border-success-border bg-success-bg",
  },
  break: {
    bg: "bg-warning-bg",
    text: "text-warning",
    border: "border-warning-border",
    card: "border-warning-border bg-warning-bg",
  },
  finished: {
    bg: "bg-bg-secondary",
    text: "text-text",
    border: "border-border",
    card: "border-border bg-bg-secondary",
  },
  absent: {
    bg: "bg-danger-bg",
    text: "text-danger",
    border: "border-danger-border",
    card: "border-danger-border bg-danger-bg",
  },
};

export function getAttendanceStatusLabel(status: AttendanceDashboardStatus): string {
  return ATTENDANCE_STATUS_LABELS[status] ?? status;
}

export function getAttendanceStatusColors(status: AttendanceDashboardStatus) {
  return ATTENDANCE_STATUS_COLORS[status] ?? ATTENDANCE_STATUS_COLORS.absent;
}
