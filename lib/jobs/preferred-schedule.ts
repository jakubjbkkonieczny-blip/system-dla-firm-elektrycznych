export type PreferredSchedulePoint = {
  date: string;
  time: string;
};

export type PreferredScheduleFields = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

export const PREFERRED_RANGE_ERROR =
  "Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse API / legacy display values into a local Date. */
export function parsePreferredDateTime(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const legacy = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})/);
  if (legacy) {
    const d = new Date(
      `${legacy[1]}T${pad2(Number(legacy[2]))}:${legacy[3]}:00`
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toPreferredIso(value: unknown): string {
  const d = parsePreferredDateTime(value);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

export function splitPreferredIso(iso: string): PreferredSchedulePoint {
  const d = parsePreferredDateTime(iso);
  if (!d) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

export function isoFromScheduleFields(
  date: string,
  time: string
): string {
  const d = date.trim();
  if (!d) return "";
  const t = time.trim() || "00:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}$/.test(t)) return "";
  const [hh, mm] = t.split(":");
  return `${d}T${pad2(Number(hh))}:${pad2(Number(mm))}:00`;
}

export function scheduleFieldsFromIso(
  preferredFrom: string,
  preferredTo: string
): PreferredScheduleFields {
  const start = splitPreferredIso(preferredFrom);
  const end = splitPreferredIso(preferredTo);
  return {
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
  };
}

export function isoFromScheduleFieldsGroup(
  fields: PreferredScheduleFields
): { preferredFrom: string; preferredTo: string } {
  return {
    preferredFrom: isoFromScheduleFields(fields.startDate, fields.startTime),
    preferredTo: isoFromScheduleFields(fields.endDate, fields.endTime),
  };
}

export function validatePreferredRange(
  preferredFrom: string,
  preferredTo: string
): string | null {
  const start = parsePreferredDateTime(preferredFrom);
  const end = parsePreferredDateTime(preferredTo);
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) return PREFERRED_RANGE_ERROR;
  return null;
}

export function formatPreferredDatePl(value: unknown): string {
  const d = parsePreferredDateTime(value);
  if (!d) return "";
  return d.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatPreferredTimePl(value: unknown): string {
  const d = parsePreferredDateTime(value);
  if (!d) return "";
  return d.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** @deprecated Use formatPreferredDatePl + formatPreferredTimePl */
export function formatPreferredDisplay(v: unknown): string {
  const d = parsePreferredDateTime(v);
  if (!d) return "";
  return `${formatPreferredDatePl(d)} ${formatPreferredTimePl(d)}`.trim();
}
