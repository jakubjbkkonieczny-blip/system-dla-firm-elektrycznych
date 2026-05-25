import "server-only";

const DEFAULT_RETENTION_HOURS = 48;

export function getAttendancePhotoRetentionMs(): number {
  const hours = Number(process.env.ATTENDANCE_PHOTO_RETENTION_HOURS ?? DEFAULT_RETENTION_HOURS);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_RETENTION_HOURS * 60 * 60 * 1000;
  }
  return hours * 60 * 60 * 1000;
}

export function attendancePhotoExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + getAttendancePhotoRetentionMs());
}
