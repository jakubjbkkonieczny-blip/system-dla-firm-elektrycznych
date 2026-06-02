export type VacationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type VacationType = "PAID" | "ON_DEMAND" | "UNPAID" | "SICK";

export type VacationEmployeeRef = {
  userId: string;
  displayName: string;
  email: string;
};

export type VacationRequestRow = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  type: VacationType;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: VacationStatus;
  reason: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type VacationTodayAbsence = {
  id: string;
  userId: string;
  displayName: string;
  type: VacationType;
  startDate: string;
  endDate: string;
};

export type VacationDashboardResponse = {
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    absentToday: number;
  };
  requests: VacationRequestRow[];
  todayAbsences: VacationTodayAbsence[];
  employees: VacationEmployeeRef[];
};

export type AbsencePlanBar = {
  requestId: string;
  type: VacationType;
  status: VacationStatus;
  startDate: string;
  endDate: string;
  startDay: number;
  spanDays: number;
};

export type AbsencePlanRow = {
  userId: string;
  displayName: string;
  bars: AbsencePlanBar[];
};

export type AbsencePlanResponse = {
  month: string;
  monthLabel: string;
  daysInMonth: number;
  rows: AbsencePlanRow[];
  page: number;
  pageSize: number;
  totalEmployees: number;
  hasMore: boolean;
};
