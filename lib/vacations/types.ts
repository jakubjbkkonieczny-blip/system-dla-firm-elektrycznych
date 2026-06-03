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

export type VacationTypeUsage = {
  days: number;
  hours: number;
};

export type VacationUtilization = {
  userId: string;
  displayName: string;
  month: {
    days: number;
    hours: number;
    byType: Record<VacationType, VacationTypeUsage>;
  };
  year: {
    days: number;
    hours: number;
    byType: Record<VacationType, VacationTypeUsage>;
  };
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
  utilization: VacationUtilization | null;
};

export type EmployeeVacationDashboardResponse = {
  month: string;
  monthLabel: string;
  usedMonth: { days: number; hours: number };
  usedYear: { days: number; hours: number };
  yearBreakdown: Record<VacationType, number>;
  requests: VacationRequestRow[];
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
  utilization: VacationUtilization | null;
};
