/**
 * OWNER is a protected company authority.
 * ADMIN may manage STAFF (and other non-owner members).
 * Only OWNER may manage another OWNER membership.
 */
export function assertCanManageTargetMembership(
  actorRole: string,
  targetRole: string
): void {
  const actor = String(actorRole || "");
  const target = String(targetRole || "");
  if (target === "owner" && actor !== "owner") {
    throw new Error("CANNOT_MODIFY_OWNER");
  }
}
