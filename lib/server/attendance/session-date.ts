import "server-only";
import { formatAttendanceDateInput, parseAttendanceDateParam } from "@/lib/attendance/dates";

export function todaySessionDate(): Date {
  return parseAttendanceDateParam(formatAttendanceDateInput(new Date()))!;
}

export function weekRangeUtc(ref: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(ref);
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

export function monthRangeUtc(ref: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));
  return { start, end };
}
