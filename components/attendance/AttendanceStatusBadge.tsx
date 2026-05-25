import {
  getAttendanceStatusColors,
  getAttendanceStatusLabel,
} from "@/lib/attendance/labels";
import type { AttendanceDashboardStatus } from "@/lib/attendance/types";

export function AttendanceStatusBadge({ status }: { status: AttendanceDashboardStatus }) {
  const colors = getAttendanceStatusColors(status);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {getAttendanceStatusLabel(status)}
    </span>
  );
}
