import "server-only";

/**
 * TODO: Run on a schedule (cron/worker) to null out expired temporary photo URLs in DB.
 * Read path already hides expired photos via effectiveAttendancePhotoUrl().
 */
export async function cleanupExpiredAttendancePhotoUrls(): Promise<void> {
  // Placeholder — implement when background jobs are introduced.
}
