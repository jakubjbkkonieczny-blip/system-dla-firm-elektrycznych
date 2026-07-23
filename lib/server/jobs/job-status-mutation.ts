import type { ActiveMember } from "@/app/api/_lib/membership";

/** Throws FORBIDDEN when a non-management member attempts to mutate job status. */
export function assertJobStatusMutationAllowed(
  member: ActiveMember,
  body: Record<string, unknown>
): void {
  if (typeof body.status !== "string") return;
  if (member.role !== "owner" && member.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
}

export function isJobStatusChange(
  body: Record<string, unknown>,
  previousStatus: string
): boolean {
  return typeof body.status === "string" && body.status !== previousStatus;
}
