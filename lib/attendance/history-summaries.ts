import type {
  AttendanceHistoryDay,
  AttendanceHistoryMonthSummary,
  AttendanceHistoryPeriodTotals,
} from "@/lib/attendance/types";

export function sumHistoryDays(days: AttendanceHistoryDay[]): AttendanceHistoryPeriodTotals {
  let totalWorkedMinutes = 0;
  let totalBreakMinutes = 0;
  const dates = new Set<string>();

  for (const d of days) {
    totalWorkedMinutes += d.totalWorkedMinutes ?? 0;
    totalBreakMinutes += d.totalBreakMinutes ?? 0;
    if (d.date) dates.add(d.date);
  }

  return {
    totalWorkedMinutes,
    totalBreakMinutes,
    workedDays: dates.size,
  };
}

export function monthSummaryToTotals(
  s: AttendanceHistoryMonthSummary
): AttendanceHistoryPeriodTotals {
  return {
    totalWorkedMinutes: s.totalWorkedMinutes,
    totalBreakMinutes: s.totalBreakMinutes,
    workedDays: s.workedDays,
  };
}

export function rollupYearTotals(
  months: AttendanceHistoryMonthSummary[],
  year: number
): AttendanceHistoryPeriodTotals {
  const filtered = months.filter((m) => m.year === year);
  return filtered.reduce<AttendanceHistoryPeriodTotals>(
    (acc, m) => ({
      totalWorkedMinutes: acc.totalWorkedMinutes + m.totalWorkedMinutes,
      totalBreakMinutes: acc.totalBreakMinutes + m.totalBreakMinutes,
      workedDays: acc.workedDays + m.workedDays,
    }),
    { totalWorkedMinutes: 0, totalBreakMinutes: 0, workedDays: 0 }
  );
}

export function buildMonthSummaryMap(
  summaries: AttendanceHistoryMonthSummary[] | undefined
): Map<string, AttendanceHistoryMonthSummary> {
  const map = new Map<string, AttendanceHistoryMonthSummary>();
  if (!summaries) return map;
  for (const s of summaries) {
    map.set(`${s.year}-${String(s.month).padStart(2, "0")}`, s);
  }
  return map;
}

export function formatWorkedHoursSummary(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  return `${h}h pracy`;
}

export function formatBreakHoursSummary(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  return `${h}h przerw`;
}

export function formatWorkedDaysSummary(days: number): string {
  return `${days} dni pracy`;
}

export function formatPeriodSummaryLine(totals: AttendanceHistoryPeriodTotals): string {
  return [
    formatWorkedHoursSummary(totals.totalWorkedMinutes),
    formatBreakHoursSummary(totals.totalBreakMinutes),
    formatWorkedDaysSummary(totals.workedDays),
  ].join(" · ");
}
