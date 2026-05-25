import "server-only";
import type { ActiveMember } from "@/app/api/_lib/membership";

export function requireOwnerOrAdmin(member: ActiveMember): void {
  if (member.role !== "owner" && member.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
}
