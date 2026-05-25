import type { AttendanceStatus } from "@/lib/attendance/types";

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  working: "W pracy",
  break: "Na przerwie",
  finished: "Zakończył",
  absent: "Nieobecny",
};

export const ATTENDANCE_STATUS_COLORS: Record<
  AttendanceStatus,
  { bg: string; text: string; border: string; card: string }
> = {
  working: {
    bg: "bg-green-50",
    text: "text-green-800",
    border: "border-green-200",
    card: "border-green-200 bg-green-50",
  },
  break: {
    bg: "bg-amber-50",
    text: "text-amber-900",
    border: "border-amber-200",
    card: "border-amber-200 bg-amber-50",
  },
  finished: {
    bg: "bg-slate-50",
    text: "text-slate-800",
    border: "border-slate-200",
    card: "border-slate-200 bg-slate-50",
  },
  absent: {
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-200",
    card: "border-red-200 bg-red-50",
  },
};

export function getAttendanceStatusLabel(status: AttendanceStatus): string {
  return ATTENDANCE_STATUS_LABELS[status] ?? status;
}

export function getAttendanceStatusColors(status: AttendanceStatus) {
  return ATTENDANCE_STATUS_COLORS[status] ?? ATTENDANCE_STATUS_COLORS.absent;
}
