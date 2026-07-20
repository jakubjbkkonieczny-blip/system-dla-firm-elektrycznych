export function getRecoveryDeadline(deactivatedAt: Date, months = 12): Date {
  const deadline = new Date(deactivatedAt);
  deadline.setMonth(deadline.getMonth() + months);
  return deadline;
}

export function isRecoverable(
  isActive: boolean,
  deactivatedAt: Date | null,
  scheduledDeletionAt: Date | null,
  now: Date = new Date()
): boolean {
  if (isActive) return false;
  if (!deactivatedAt || !scheduledDeletionAt) return false;
  return now < scheduledDeletionAt;
}

export function isPermanentDeletionPending(
  isActive: boolean,
  scheduledDeletionAt: Date | null,
  now: Date = new Date()
): boolean {
  if (isActive || !scheduledDeletionAt) return false;
  return now >= scheduledDeletionAt;
}
