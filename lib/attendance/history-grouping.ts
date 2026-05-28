import { historyMonthKey } from "@/lib/attendance/history-labels";
import type { AttendanceHistoryDay } from "@/lib/attendance/types";

export type HistoryMonthGroup = {
  key: string;
  year: number;
  month: number;
  days: AttendanceHistoryDay[];
};

export type HistoryYearGroup = {
  year: number;
  months: HistoryMonthGroup[];
};

function parseDateParts(date: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

/** Groups paginated history rows into year → month trees (newest first). */
export function groupHistoryByYearMonth(items: AttendanceHistoryDay[]): HistoryYearGroup[] {
  const yearMap = new Map<number, Map<number, AttendanceHistoryDay[]>>();

  for (const item of items) {
    const parts = parseDateParts(item.date);
    if (!parts) continue;

    let months = yearMap.get(parts.year);
    if (!months) {
      months = new Map();
      yearMap.set(parts.year, months);
    }

    const bucket = months.get(parts.month) ?? [];
    bucket.push(item);
    months.set(parts.month, bucket);
  }

  const years = Array.from(yearMap.keys()).sort((a, b) => b - a);

  return years.map((year) => {
    const monthsMap = yearMap.get(year)!;
    const monthNums = Array.from(monthsMap.keys()).sort((a, b) => b - a);

    const months: HistoryMonthGroup[] = monthNums.map((month) => ({
      key: historyMonthKey(year, month),
      year,
      month,
      days: monthsMap.get(month) ?? [],
    }));

    return { year, months };
  });
}

export function getDefaultExpandedKeys(groups: HistoryYearGroup[]): {
  years: number[];
  months: string[];
} {
  const newestYear = groups[0];
  if (!newestYear) return { years: [], months: [] };

  const newestMonth = newestYear.months[0];
  return {
    years: [newestYear.year],
    months: newestMonth ? [newestMonth.key] : [],
  };
}
