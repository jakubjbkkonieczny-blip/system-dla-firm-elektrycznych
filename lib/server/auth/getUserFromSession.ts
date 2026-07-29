import "server-only";

import {
  requireSessionUserFromActiveAdapter,
  resolveSessionUserFromActiveAdapter,
  type SessionUser,
} from "@/lib/supabase/auth-adapter";

export type { SessionUser };

/**
 * Resolves the authenticated VectorWork user via the active auth adapter.
 * Legacy HMAC when SUPABASE_AUTH_ENABLED≠true; Supabase Auth when enabled.
 * No silent fallback between modes.
 */
export async function getUserFromSession(): Promise<SessionUser | null> {
  return resolveSessionUserFromActiveAdapter();
}

/** Throws `MISSING_AUTH` when no valid session exists for the active mode. */
export async function requireSessionUser(): Promise<SessionUser> {
  return requireSessionUserFromActiveAdapter();
}
