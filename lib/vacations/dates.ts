const MONTH_NAMES = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
] as const;

export const VACATION_MONTH_NAMES: readonly string[] = MONTH_NAMES;

export function getVacationYearOptions(viewedYear: number): number[] {
  const anchor = new Date().getFullYear();
  const min = Math.min(anchor - 4, viewedYear);
  const max = Math.max(anchor + 3, viewedYear);
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export function formatVacationDateInput(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMonthParam(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function parseMonthParam(value: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const [y, m] = value.split("-").map(Number);
  return { year: y, month: m };
}

export function getMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function formatMonthParamFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

export function computeInclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
}

export function dateToUtcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function formatDateFromDb(date: Date): string {
  return date.toISOString().slice(0, 10);
}
