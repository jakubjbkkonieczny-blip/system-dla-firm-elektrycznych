export type AttendanceStatus = "working" | "break" | "finished" | "absent";

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
  status: AttendanceStatus;
  startedAt: string | null;
  endedAt: string | null;
  workDurationMs: number | null;
  locationText: string | null;
  checkInPhoto: AttendancePhotoView;
  checkOutPhoto: AttendancePhotoView;
  sessionId: string | null;
};

export type AttendanceDashboardResponse = {
  date: string;
  summary: AttendanceSummary;
  rows: AttendanceDashboardRow[];
  employees: AttendanceEmployeeRef[];
};
