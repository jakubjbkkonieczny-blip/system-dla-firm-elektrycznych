export type JobVisibilityMember = {
  role: string;
  scope: string | null;
};

/**
 * Canonical staff job visibility:
 * - owner/admin: always
 * - staff + assigned: yes
 * - staff + scope=all: yes
 * - staff + assigned_only + unassigned: no
 */
export function canMemberSeeJob(
  member: JobVisibilityMember,
  userId: string,
  assignedIds: string[]
): boolean {
  const role = String(member.role || "staff");
  const scope = String(member.scope || "all");
  if (role === "owner" || role === "admin") return true;
  return assignedIds.includes(userId) || scope === "all";
}

/**
 * True when visibility does not depend on JobAssignment.
 * Uses the same role and scope normalization as canMemberSeeJob:
 * null and empty scope stay "all"; only scope "all" broadens staff access.
 */
export function memberSeesAllCompanyJobs(member: JobVisibilityMember): boolean {
  const role = String(member.role || "staff");
  const scope = String(member.scope || "all");
  return role === "owner" || role === "admin" || scope === "all";
}
