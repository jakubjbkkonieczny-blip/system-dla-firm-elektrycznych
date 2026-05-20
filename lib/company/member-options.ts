export type CompanyMemberOption = {
  uid: string;
  email: string;
  role: "owner" | "admin" | "staff";
  displayName?: string;
  label: string;
};

/** Staff only — owners/admins are not selectable for job assignment UI. */
export function filterAssignableMembers(
  members: CompanyMemberOption[]
): CompanyMemberOption[] {
  return members.filter((m) => m.role === "staff");
}
