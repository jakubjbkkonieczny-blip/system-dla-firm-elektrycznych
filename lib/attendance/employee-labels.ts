import type { AttendanceEmployeeState } from "@/lib/attendance/types";

export const EMPLOYEE_STATE_LABELS: Record<AttendanceEmployeeState, string> = {
  not_started: "Nie rozpoczęto",
  working: "W pracy",
  on_break: "Na przerwie",
  finished: "Zakończono pracę",
};

export function getEmployeeStateLabel(state: AttendanceEmployeeState): string {
  return EMPLOYEE_STATE_LABELS[state] ?? state;
}
