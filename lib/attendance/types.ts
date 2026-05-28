/** Owner/admin dashboard aggregate status (cards, filters, badges). */
export type AttendanceDashboardStatus = "working" | "break" | "finished" | "absent";

/** Employee session state stored in DB. */
export type AttendanceEmployeeState = "not_started" | "working" | "on_break" | "finished";

export type AttendanceAction =
  | "start_work"
  | "start_break"
  | "end_break"
  | "finish_work";

export type AttendanceSummary = {
  working: number;
  break: number;
  finished: number;
  absent: number;
  total: number;
};

export type AttendanceEmployeeRef = {
  userId: string;
  displayName: string;
  email: string;
};

export type AttendancePhotoView = {
  url: string | null;
  expired: boolean;
};

export type AttendanceDashboardRow = {
  userId: string;
  displayName: string;
  email: string;
  status: AttendanceDashboardStatus;
  startedAt: string | null;
  endedAt: string | null;
  workDurationMs: number | null;
  breakDurationMs: number | null;
  locationText: string | null;
  proofPhoto: AttendancePhotoView;
  sessionId: string | null;
};

/** @deprecated Use AttendanceDashboardStatus */
export type AttendanceStatus = AttendanceDashboardStatus;

export type AttendanceDashboardResponse = {
  date: string;
  summary: AttendanceSummary;
  rows: AttendanceDashboardRow[];
  employees: AttendanceEmployeeRef[];
};

export type AttendanceMeResponse = {
  sessionDate: string;
  state: AttendanceEmployeeState;
  startedAt: string | null;
  breakStartedAt: string | null;
  endedAt: string | null;
  totalBreakMinutes: number;
  totalWorkedMinutes: number | null;
  locationText: string | null;
  sessionId: string | null;
  availableActions: AttendanceAction[];
};

export type AttendanceActionResponse = {
  ok: boolean;
  message: string;
  session: AttendanceMeResponse;
};

export type AttendanceHistoryDay = {
  id: string;
  date: string;
  status: AttendanceDashboardStatus;
  startedAt: string | null;
  endedAt: string | null;
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
};

export type AttendanceHistoryPeriodTotals = {
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
  workedDays: number;
};

/** Per calendar month aggregates for the filtered employee (full history). */
export type AttendanceHistoryMonthSummary = {
  year: number;
  month: number;
} & AttendanceHistoryPeriodTotals;

export type AttendanceHistoryResponse = {
  items: AttendanceHistoryDay[];
  nextCursor: string | null;
  limit: number;
  /** Included on the first page (no cursor) for period header totals. */
  monthSummaries?: AttendanceHistoryMonthSummary[];
};

export type AttendanceHoursSummary = {
  userId: string;
  displayName: string;
  email: string;
  date: string;
  todayWorkedMinutes: number;
  todayBreakMinutes: number;
  weekWorkedMinutes: number;
  monthWorkedMinutes: number;
  /** First page from history API (no fixed day window). */
  history: AttendanceHistoryDay[];
};
