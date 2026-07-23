import type { CompanyRole, CompanyRoleFetchOutcome } from "./appShellRole";

export function buildRoleContextKey(userId: string, companyId: string): string {
  return `${userId}:${companyId}`;
}

/** Ignore async role responses that no longer match the current user+company identity. */
export function shouldApplyRoleFetchResult(
  requestKey: string,
  currentKey: string
): boolean {
  return requestKey.length > 0 && requestKey === currentKey;
}

export function fetchOutcomeForIdentityChange(input: {
  isAuthed: boolean;
  hideShell: boolean;
  companyId: string;
  companyReady: boolean;
}): CompanyRoleFetchOutcome {
  if (!input.isAuthed || input.hideShell) {
    return { status: "idle" };
  }

  if (!input.companyReady) {
    return { status: "loading" };
  }

  if (!input.companyId) {
    return { status: "no_company" };
  }

  return { status: "loading" };
}

export type ResolvedRoleFetchResponse =
  | { kind: "applied"; outcome: CompanyRoleFetchOutcome }
  | { kind: "stale" };

export function resolveRoleFetchResponse(input: {
  requestKey: string;
  currentKey: string;
  role: unknown;
}): ResolvedRoleFetchResponse {
  if (!shouldApplyRoleFetchResult(input.requestKey, input.currentKey)) {
    return { kind: "stale" };
  }

  if (input.role === "owner" || input.role === "admin" || input.role === "staff") {
    return {
      kind: "applied",
      outcome: { status: "success", role: input.role },
    };
  }

  return {
    kind: "applied",
    outcome: { status: "error" },
  };
}

export function resolveRoleFetchError(input: {
  requestKey: string;
  currentKey: string;
}): ResolvedRoleFetchResponse {
  if (!shouldApplyRoleFetchResult(input.requestKey, input.currentKey)) {
    return { kind: "stale" };
  }

  return {
    kind: "applied",
    outcome: { status: "error" },
  };
}
