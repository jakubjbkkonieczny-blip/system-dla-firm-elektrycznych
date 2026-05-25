import type { AttendancePhotoView } from "@/lib/attendance/types";

/** Default client hint; server uses ATTENDANCE_PHOTO_RETENTION_HOURS env. */
export const ATTENDANCE_PHOTO_TTL_MS = 48 * 60 * 60 * 1000;

export function attendancePhotoExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + ATTENDANCE_PHOTO_TTL_MS);
}

export function isAttendancePhotoExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function effectiveAttendancePhotoUrl(
  url: string | null | undefined,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!url?.trim()) return null;
  if (isAttendancePhotoExpired(expiresAt, now)) return null;
  return url;
}

export function toAttendancePhotoView(
  url: string | null | undefined,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): AttendancePhotoView {
  const hadUrl = Boolean(url?.trim());
  const visible = effectiveAttendancePhotoUrl(url, expiresAt, now);
  return {
    url: visible,
    expired: hadUrl && !visible,
  };
}

export const ATTENDANCE_PHOTO_HELPER_TEXT =
  "Zdjęcia potwierdzające są opcjonalne, tymczasowe i automatycznie wygasają po okresie retencji (domyślnie 48 h). Nie trafiają do galerii.";
