import { NextResponse } from "next/server";

/**
 * Maps non-auth errors to HTTP status, or returns `null` to fall through to 500 INTERNAL_ERROR.
 */
export type SessionRouteErrorMap = (message: string) => number | null;

export function handleSessionRouteError(e: unknown): NextResponse {
  return handleSessionRouteErrorOr(e, () => null);
}

/** Shared mapping for company-scoped API routes. */
export function companyRouteErrorStatus(message: string): number | null {
  if (message === "NOT_MEMBER" || message === "NOT_ACTIVE_MEMBER") return 403;
  if (
    message === "JOB_NOT_FOUND" ||
    message === "STAGE_NOT_FOUND" ||
    message === "MEMBER_NOT_FOUND" ||
    message === "USER_NOT_FOUND" ||
    message === "COMPANY_NOT_FOUND"
  ) {
    return 404;
  }
  if (
    message === "FORBIDDEN" ||
    message === "CANNOT_MODIFY_SELF" ||
    message === "CANNOT_DELETE_SELF"
  ) {
    return 403;
  }
  return null;
}

export function handleSessionRouteErrorOr(
  e: unknown,
  mapStatus: SessionRouteErrorMap
): NextResponse {
  const msg = e instanceof Error ? e.message : "UNKNOWN";
  if (msg === "MISSING_AUTH") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mapped = mapStatus(msg);
  if (mapped !== null) {
    return NextResponse.json({ error: msg }, { status: mapped });
  }
  console.error(e);
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
