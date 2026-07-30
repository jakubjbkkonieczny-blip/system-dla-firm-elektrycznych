/**
 * Employer final-deactivation password proof.
 * Legacy: bcrypt against User.passwordHash.
 * Supabase: signInWithPassword against the current Auth identity — never passwordHash.
 *
 * Supabase Auth clients are injected so unit tests can cover fail-closed paths
 * without importing Next.js server-only boundaries.
 */

import bcrypt from "bcrypt";

import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import {
  logAuthDiagnostic,
  publicMessageForAuthError,
  SupabaseAuthError,
} from "@/lib/supabase/errors";
import { normalizeAuthEmail } from "@/lib/supabase/provisioning";

export type DeactivationPasswordActor = {
  id: string;
  passwordHash: string | null;
  supabaseAuthUserId: string | null;
  isActive: boolean;
  email: string;
};

export type SupabaseReauthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message?: string } | null;
    }>;
    signInWithPassword: (creds: {
      email: string;
      password: string;
    }) => Promise<{
      data: { user: { id: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export type VerifyDeactivationPasswordInput = {
  actor: DeactivationPasswordActor;
  currentPassword: string;
  /** Test / composition seam — production uses createSupabaseServerClient. */
  createSupabaseClient?: () => Promise<SupabaseReauthClient>;
  /** Optional env override for tests (defaults to process.env). */
  env?: { SUPABASE_AUTH_ENABLED?: string };
};

/**
 * Prove the caller knows the current password for this actor.
 * Fail closed on missing/invalid/conflicting/inactive identity.
 * Does not store plaintext passwords. Does not use the service-role key.
 */
export async function verifyDeactivationPassword(
  input: VerifyDeactivationPasswordInput
): Promise<void> {
  const password = input.currentPassword;
  if (!password) {
    throw new Error("MISSING_CURRENT_PASSWORD");
  }

  if (isSupabaseAuthEnabled((input.env ?? process.env) as Record<string, string | undefined>)) {
    await verifyViaSupabase(input.actor, password, input.createSupabaseClient);
    return;
  }

  await verifyViaLegacyHash(input.actor, password);
}

async function verifyViaLegacyHash(
  actor: DeactivationPasswordActor,
  currentPassword: string
): Promise<void> {
  // Legacy mode: local hash only. Supabase-managed null hashes cannot deactivate here.
  if (!actor.passwordHash) {
    throw new Error("AUTH_PASSWORD_REAUTH_REQUIRED");
  }
  const passwordMatches = await bcrypt.compare(currentPassword, actor.passwordHash);
  if (!passwordMatches) {
    throw new Error("INVALID_PASSWORD");
  }
}

async function verifyViaSupabase(
  actor: DeactivationPasswordActor,
  currentPassword: string,
  createSupabaseClient?: () => Promise<SupabaseReauthClient>
): Promise<void> {
  if (!actor.supabaseAuthUserId) {
    logAuthDiagnostic("AUTH_USER_UNLINKED", { deactivationReauth: true });
    throw new Error("AUTH_PASSWORD_REAUTH_REQUIRED");
  }

  try {
    const supabase = createSupabaseClient
      ? await createSupabaseClient()
      : await (await import("@/lib/supabase/server-client")).createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id || !user.email) {
      logAuthDiagnostic("AUTH_UNAUTHENTICATED", { deactivationReauth: true });
      throw new Error("UNAUTHORIZED");
    }

    // Reauthentication must belong to the same authenticated Supabase identity
    // that maps to this VectorWork User.id.
    if (user.id !== actor.supabaseAuthUserId) {
      logAuthDiagnostic("AUTH_USER_CONFLICT", {
        deactivationIdentityMismatch: true,
      });
      throw new Error("INVALID_PASSWORD");
    }

    if (normalizeAuthEmail(user.email) !== normalizeAuthEmail(actor.email)) {
      logAuthDiagnostic("AUTH_EMAIL_CONFLICT", {
        deactivationEmailMismatch: true,
      });
      throw new Error("INVALID_PASSWORD");
    }

    const verify = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verify.error || !verify.data.user) {
      throw new Error("INVALID_PASSWORD");
    }

    if (verify.data.user.id !== actor.supabaseAuthUserId) {
      logAuthDiagnostic("AUTH_USER_CONFLICT", {
        deactivationVerifyMismatch: true,
      });
      throw new Error("INVALID_PASSWORD");
    }
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "INVALID_PASSWORD" ||
        error.message === "UNAUTHORIZED" ||
        error.message === "AUTH_PASSWORD_REAUTH_REQUIRED" ||
        error.message === "FORBIDDEN" ||
        error.message === "MISSING_CURRENT_PASSWORD"
      ) {
        throw error;
      }
    }
    if (error instanceof SupabaseAuthError) {
      throw new Error(
        error.category === "AUTH_PROVIDER_UNAVAILABLE"
          ? "AUTH_PROVIDER_UNAVAILABLE"
          : "INVALID_PASSWORD"
      );
    }
    logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", {
      deactivationReauthFailed: true,
    });
    throw new Error("AUTH_PROVIDER_UNAVAILABLE");
  }
}

export function publicDeactivationReauthMessage(code: string): string | undefined {
  if (code === "AUTH_PASSWORD_REAUTH_REQUIRED") {
    return publicMessageForAuthError("AUTH_PASSWORD_REAUTH_REQUIRED");
  }
  if (code === "AUTH_PROVIDER_UNAVAILABLE") {
    return publicMessageForAuthError("AUTH_PROVIDER_UNAVAILABLE");
  }
  return undefined;
}
