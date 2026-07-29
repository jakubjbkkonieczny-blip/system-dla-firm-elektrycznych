/**
 * Canonical server-side resolver for Supabase Auth mode.
 *
 * Flow:
 * 1. Verify Supabase Auth user via getUser() (Auth server confirmation).
 * 2. Map auth.users.id → User.supabaseAuthUserId → User.id
 * 3. Existing business guards continue using User.id
 *
 * Authentication ≠ business access. Unmapped Auth users are denied.
 */

import "server-only";

import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  logAuthDiagnostic,
  SupabaseAuthError,
} from "@/lib/supabase/errors";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import {
  normalizeAuthEmail,
  resolveLinkedUser,
  type VerifiedAuthIdentity,
} from "@/lib/supabase/provisioning";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export type ResolveSupabaseSessionResult =
  | { ok: true; user: SessionUser; authUserId: string }
  | { ok: false; error: SupabaseAuthError };

export function authIdentityFromSupabaseUser(
  authUser: SupabaseAuthUser
): VerifiedAuthIdentity {
  const email = normalizeAuthEmail(authUser.email ?? "");
  const emailConfirmed = Boolean(
    authUser.email_confirmed_at || authUser.confirmed_at
  );
  const metaName =
    typeof authUser.user_metadata?.displayName === "string"
      ? authUser.user_metadata.displayName
      : typeof authUser.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : null;

  return {
    authUserId: authUser.id,
    email,
    emailConfirmed,
    // Display name is optional profile only — never used for authorization.
    displayName: metaName,
  };
}

/**
 * Verifies the Supabase session and returns the VectorWork SessionUser.
 * Does not mint legacy cookies. Does not fall back to HMAC auth.
 */
export async function resolveSupabaseSessionUser(): Promise<ResolveSupabaseSessionResult> {
  if (!isSupabaseAuthEnabled()) {
    return {
      ok: false,
      error: new SupabaseAuthError("AUTH_MODE_MISMATCH", {
        message: "Supabase Auth is not enabled",
      }),
    };
  }

  if (!getSupabasePublicEnv()) {
    logAuthDiagnostic("AUTH_CONFIGURATION_ERROR", { missingPublicEnv: true });
    return {
      ok: false,
      error: new SupabaseAuthError("AUTH_CONFIGURATION_ERROR"),
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      logAuthDiagnostic("AUTH_UNAUTHENTICATED", {
        providerError: Boolean(error),
      });
      return {
        ok: false,
        error: new SupabaseAuthError("AUTH_UNAUTHENTICATED"),
      };
    }

    const identity = authIdentityFromSupabaseUser(data.user);
    if (!identity.emailConfirmed) {
      return {
        ok: false,
        error: new SupabaseAuthError("AUTH_UNAUTHENTICATED", {
          publicCode: "EMAIL_NOT_CONFIRMED",
          httpStatus: 403,
        }),
      };
    }

    const linked = await resolveLinkedUser(prisma, identity);

    const user = await prisma.user.findUnique({
      where: { id: linked.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        accountRole: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive) {
      return {
        ok: false,
        error: new SupabaseAuthError("AUTH_USER_INACTIVE", {
          publicCode: "ACCOUNT_DISABLED",
        }),
      };
    }

    return { ok: true, user, authUserId: identity.authUserId };
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      return { ok: false, error };
    }
    logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", { unexpected: true });
    return {
      ok: false,
      error: new SupabaseAuthError("AUTH_PROVIDER_UNAVAILABLE", { cause: error }),
    };
  }
}

export async function requireSupabaseSessionUser(): Promise<SessionUser> {
  const result = await resolveSupabaseSessionUser();
  if (!result.ok) {
    if (result.error.category === "AUTH_UNAUTHENTICATED") {
      throw new Error("MISSING_AUTH");
    }
    throw result.error;
  }
  return result.user;
}
