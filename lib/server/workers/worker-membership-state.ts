export type WorkerMembershipState = "ACTIVE" | "SUSPENDED" | "ORPHAN";

export function deriveWorkerMembershipState(
  activeMemberships: number,
  totalMemberships: number
): WorkerMembershipState {
  if (activeMemberships > 0) {
    return "ACTIVE";
  }
  if (totalMemberships > 0) {
    return "SUSPENDED";
  }
  return "ORPHAN";
}

export function resolvePendingDeletionAt(
  state: WorkerMembershipState,
  now: Date = new Date()
): Date | null {
  if (state === "ORPHAN") {
    return now;
  }
  return null;
}

/** True only when the worker has no company rows left (true ORPHAN). */
export function shouldTombstonePendingWorker(totalMemberships: number): boolean {
  return totalMemberships === 0;
}
