export type CompanyRole = "owner" | "admin" | "staff";

export type CompanyRoleFetchOutcome =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "no_company" }
  | { status: "success"; role: CompanyRole }
  | { status: "error" };

export type AppShellRoleState = {
  role: CompanyRole | null;
  roleLoaded: boolean;
  shouldClearActiveCompany: boolean;
  isOwnerOrAdmin: boolean;
  roleLabel: string;
};

export function parseCompanyRole(value: unknown): CompanyRole | null {
  if (value === "owner" || value === "admin" || value === "staff") {
    return value;
  }
  return null;
}

export function deriveAppShellRoleState(input: {
  isAuthed: boolean;
  hideShell: boolean;
  companyId: string;
  companyReady?: boolean;
  fetchOutcome: CompanyRoleFetchOutcome;
}): AppShellRoleState {
  const { isAuthed, hideShell, companyId, fetchOutcome } = input;
  const companyReady = input.companyReady ?? true;

  if (!isAuthed || hideShell) {
    return {
      role: null,
      roleLoaded: false,
      shouldClearActiveCompany: false,
      isOwnerOrAdmin: false,
      roleLabel: "",
    };
  }

  if (!companyReady) {
    return {
      role: null,
      roleLoaded: false,
      shouldClearActiveCompany: false,
      isOwnerOrAdmin: false,
      roleLabel: "",
    };
  }

  if (!companyId || fetchOutcome.status === "no_company") {
    return {
      role: null,
      roleLoaded: true,
      shouldClearActiveCompany: false,
      isOwnerOrAdmin: false,
      roleLabel: "Brak aktywnej firmy",
    };
  }

  if (fetchOutcome.status === "idle" || fetchOutcome.status === "loading") {
    return {
      role: null,
      roleLoaded: false,
      shouldClearActiveCompany: false,
      isOwnerOrAdmin: false,
      roleLabel: "",
    };
  }

  if (fetchOutcome.status === "error") {
    return {
      role: null,
      roleLoaded: true,
      shouldClearActiveCompany: true,
      isOwnerOrAdmin: false,
      roleLabel: "Brak aktywnej firmy",
    };
  }

  const role = fetchOutcome.role;
  const roleLabel =
    role === "owner"
      ? "Właściciel"
      : role === "admin"
        ? "Administrator"
        : "Pracownik";

  return {
    role,
    roleLoaded: true,
    shouldClearActiveCompany: false,
    isOwnerOrAdmin: role === "owner" || role === "admin",
    roleLabel,
  };
}
