export type MemberRole = "owner" | "admin" | "staff";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Właściciel",
  admin: "Pracodawca",
  staff: "Pracownik",
};

const SCOPE_LABELS: Record<string, string> = {
  all: "Wszystkie zlecenia",
  assigned_only: "Tylko przypisane zlecenia",
  assigned: "Tylko przypisane zlecenia",
};

export function getMemberDisplayName(member: {
  displayName?: string | null;
  email?: string | null;
}): string {
  const name = (member.displayName ?? "").trim();
  if (name) return name;
  const email = (member.email ?? "").trim();
  if (email) return email;
  return "Brak danych";
}

/** Email line under the display name; null when redundant or missing. */
export function getMemberEmailLine(member: {
  displayName?: string | null;
  email?: string | null;
}): string | null {
  const name = (member.displayName ?? "").trim();
  const email = (member.email ?? "").trim();
  if (!email || !name) return null;
  return email;
}

export function getMemberRoleLabel(role: string): string {
  return ROLE_LABELS[role as MemberRole] ?? role;
}

export function getMemberScopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

export function getMemberStatusLabel(active: boolean): string {
  return active ? "Aktywny" : "Nieaktywny";
}
