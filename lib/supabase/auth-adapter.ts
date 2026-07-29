/**
 * Authentication adapter boundary.
 *
 * SUPABASE_AUTH_ENABLED=false → legacy HMAC session only (default).
 * SUPABASE_AUTH_ENABLED=true  → Supabase Auth only (no silent fallback).
 *
 * Business authorization (CompanyMember, scope, billing) is unchanged.
 */

import "server-only";

import {
  getUserFromLegacySession,
  type SessionUser,
} from "@/lib/server/auth/legacy-session";
import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import { resolveSupabaseSessionUser } from "@/lib/supabase/resolve-session-user";
import { SupabaseAuthError } from "@/lib/supabase/errors";

export type AuthMode = "legacy" | "supabase";

export function getAuthMode(): AuthMode {
  return isSupabaseAuthEnabled() ? "supabase" : "legacy";
}

/**
 * Canonical session user resolution used by requireSessionUser().
 * Explicit mode selection — never tries the other system on failure.
 */
export async function resolveSessionUserFromActiveAdapter(): Promise<SessionUser | null> {
  if (getAuthMode() === "supabase") {
    const result = await resolveSupabaseSessionUser();
    if (!result.ok) {
      // Inactive / conflict remain denied (null) for getUserFromSession parity,
      // except we rethrow configuration / provider outages as typed errors upstream
      // via requireSessionUser when needed. Here: unauthenticated → null.
      if (
        result.error.category === "AUTH_CONFIGURATION_ERROR" ||
        result.error.category === "AUTH_PROVIDER_UNAVAILABLE"
      ) {
        throw result.error;
      }
      return null;
    }
    return result.user;
  }

  return getUserFromLegacySession();
}

export async function requireSessionUserFromActiveAdapter(): Promise<SessionUser> {
  try {
    const user = await resolveSessionUserFromActiveAdapter();
    if (!user) throw new Error("MISSING_AUTH");
    return user;
  } catch (error) {
    if (error instanceof SupabaseAuthError) throw error;
    throw error;
  }
}

export { type SessionUser };
