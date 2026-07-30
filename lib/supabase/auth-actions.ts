/**
 * Supabase Auth server operations (register / login / logout / recovery / password).
 * Used only when SUPABASE_AUTH_ENABLED=true. Never mints legacy HMAC sessions.
 * Never reads or writes User.passwordHash for credential operations.
 */

import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { clearSessionCookie } from "@/lib/server/auth/session";
import {
  classifyProviderAuthError,
  logAuthDiagnostic,
  publicMessageForAuthError,
  SupabaseAuthError,
} from "@/lib/supabase/errors";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import {
  ensureProvisionedUserAfterAuth,
  normalizeAuthEmail,
  resolveLinkedUser,
  type VerifiedAuthIdentity,
} from "@/lib/supabase/provisioning";
import {
  authIdentityFromSupabaseUser,
  resolveSupabaseSessionUser,
} from "@/lib/supabase/resolve-session-user";
import { safeRedirectPath } from "@/lib/supabase/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

function assertSupabaseMode(): void {
  if (!isSupabaseAuthEnabled()) {
    throw new SupabaseAuthError("AUTH_MODE_MISMATCH");
  }
  if (!getSupabasePublicEnv()) {
    throw new SupabaseAuthError("AUTH_CONFIGURATION_ERROR");
  }
}

function appOriginFromRequest(req: Request): string {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    const proto = forwardedProto === "http" ? "http" : "https";
    return `${proto}://${forwardedHost}`;
  }
  return url.origin;
}

export function buildAuthCallbackUrl(req: Request, nextPath?: string): string {
  const origin = appOriginFromRequest(req);
  const next = safeRedirectPath(nextPath ?? "/login");
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function buildPasswordRecoveryRedirectUrl(req: Request): string {
  const origin = appOriginFromRequest(req);
  return `${origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`;
}

/** Register via Supabase Auth. Password goes only to Supabase. */
export async function supabaseRegister(input: {
  email: string;
  password: string;
  displayName?: string | null;
  req: Request;
}): Promise<
  | { ok: true; requiresEmailConfirmation: boolean }
  | { ok: false; status: number; error: string; message?: string }
> {
  assertSupabaseMode();
  const email = normalizeAuthEmail(input.email);
  const password = input.password;
  const displayName =
    typeof input.displayName === "string" && input.displayName.trim()
      ? input.displayName.trim()
      : null;

  if (!email || password.length < 6) {
    return {
      ok: false,
      status: 400,
      error: "INVALID_INPUT",
      message: "Email is required and password must be at least 6 chars.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const emailRedirectTo = buildAuthCallbackUrl(input.req, "/login");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: displayName ? { displayName } : undefined,
      },
    });

    if (error) {
      logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", {
        signupFailed: true,
        status: error.status ?? 0,
      });
      // Avoid leaking account existence beyond generic failure when possible.
      const msg = (error.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        return { ok: false, status: 400, error: "USER_EXISTS" };
      }
      return { ok: false, status: 400, error: "INVALID_INPUT" };
    }

    const user = data.user;
    const session = data.session;

    // Identities empty often means "user already exists" with confirmations on.
    if (user && Array.isArray(user.identities) && user.identities.length === 0) {
      return { ok: false, status: 400, error: "USER_EXISTS" };
    }

    if (session && user) {
      // Confirmations disabled — provision immediately from verified session.
      const base = authIdentityFromSupabaseUser(user);
      const identity: VerifiedAuthIdentity = {
        ...base,
        // Active session after signUp implies this project allows sign-in without confirm.
        emailConfirmed: true,
      };
      try {
        await ensureProvisionedUserAfterAuth(prisma, identity);
      } catch (provisionError) {
        if (provisionError instanceof SupabaseAuthError) {
          logAuthDiagnostic(provisionError.category, { afterSignup: true });
          return {
            ok: false,
            status: provisionError.httpStatus,
            error: provisionError.publicCode,
            message: publicMessageForAuthError(provisionError.category),
          };
        }
        return {
          ok: false,
          status: 503,
          error: "AUTH_PROVISIONING_FAILED",
          message: publicMessageForAuthError("AUTH_PROVISIONING_FAILED"),
        };
      }
      return { ok: true, requiresEmailConfirmation: false };
    }

    // Await email confirmation — VectorWork User created on callback.
    return { ok: true, requiresEmailConfirmation: true };
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      return {
        ok: false,
        status: error.httpStatus,
        error: error.publicCode,
        message: publicMessageForAuthError(error.category),
      };
    }
    logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", { signupException: true });
    return { ok: false, status: 503, error: "AUTH_PROVIDER_UNAVAILABLE" };
  }
}

/** Password login via Supabase. Does not compare passwordHash or mint HMAC cookie. */
export async function supabaseLogin(input: {
  email: string;
  password: string;
}): Promise<
  | { ok: true; userId: string; deactivated?: false }
  | { ok: true; deactivated: true }
  | { ok: false; status: number; error: string }
> {
  assertSupabaseMode();
  const email = normalizeAuthEmail(input.email);
  const password = input.password;
  if (!email || !password) {
    return { ok: false, status: 400, error: "MISSING_CREDENTIALS" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      logAuthDiagnostic("AUTH_UNAUTHENTICATED", { loginFailed: true });
      return { ok: false, status: 401, error: "INVALID_CREDENTIALS" };
    }

    const identity = authIdentityFromSupabaseUser(data.user);

    // Mapping missing → try idempotent Case-1 provisioning retry (partial-failure recovery).
    // Does not auto-claim existing unlinked emails (still AUTH_USER_CONFLICT).
    let linked;
    try {
      linked = await resolveLinkedUser(prisma, identity);
    } catch (mapError) {
      if (
        mapError instanceof SupabaseAuthError &&
        mapError.category === "AUTH_USER_UNLINKED"
      ) {
        try {
          linked = await ensureProvisionedUserAfterAuth(prisma, identity);
        } catch (provisionError) {
          await supabase.auth.signOut();
          if (provisionError instanceof SupabaseAuthError) {
            if (provisionError.category === "AUTH_USER_INACTIVE") {
              return { ok: false, status: 403, error: "ACCOUNT_DISABLED" };
            }
            if (
              provisionError.category === "AUTH_EMAIL_CONFLICT" ||
              provisionError.category === "AUTH_USER_CONFLICT"
            ) {
              return { ok: false, status: 403, error: "INVALID_CREDENTIALS" };
            }
            if (provisionError.category === "AUTH_PROVISIONING_FAILED") {
              return { ok: false, status: 503, error: "AUTH_PROVISIONING_FAILED" };
            }
          }
          return { ok: false, status: 401, error: "INVALID_CREDENTIALS" };
        }
      } else {
        await supabase.auth.signOut();
        if (mapError instanceof SupabaseAuthError) {
          if (mapError.category === "AUTH_USER_INACTIVE") {
            // Deactivated employer recovery remains a separate business flow.
            // Supabase path does not mint deactivated-access via passwordHash.
            return { ok: false, status: 403, error: "ACCOUNT_DISABLED" };
          }
          if (
            mapError.category === "AUTH_EMAIL_CONFLICT" ||
            mapError.category === "AUTH_USER_CONFLICT"
          ) {
            return { ok: false, status: 403, error: "INVALID_CREDENTIALS" };
          }
        }
        return { ok: false, status: 401, error: "INVALID_CREDENTIALS" };
      }
    }

    return { ok: true, userId: linked.id };
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      if (error.category === "AUTH_CONFIGURATION_ERROR") {
        return { ok: false, status: 503, error: "AUTH_CONFIGURATION_ERROR" };
      }
    }
    logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", { loginException: true });
    return { ok: false, status: 503, error: "AUTH_PROVIDER_UNAVAILABLE" };
  }
}

/** Supabase logout + clear any leftover legacy session cookie (migration hygiene). */
export async function supabaseLogout(): Promise<NextResponse> {
  assertSupabaseMode();
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (error) {
    logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", { logoutFailed: true });
  }
  const res = NextResponse.json({ ok: true }, { status: 200 });
  // Explicit migration-only cleanup of legacy cookie if present.
  return clearSessionCookie(res);
}

/** Generic forgot-password — always same public response. */
export async function supabaseRequestPasswordRecovery(input: {
  email: string;
  req: Request;
}): Promise<{ ok: true }> {
  assertSupabaseMode();
  const email = normalizeAuthEmail(input.email);
  // Always return ok to avoid account enumeration.
  if (!email) return { ok: true };

  try {
    const supabase = await createSupabaseServerClient();
    const redirectTo = buildPasswordRecoveryRedirectUrl(input.req);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", {
        recoveryRequestFailed: true,
        status: error.status ?? 0,
      });
    }
  } catch {
    logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", {
      recoveryRequestException: true,
    });
  }
  return { ok: true };
}

/** Complete password recovery / logged-in password change via Supabase. */
export async function supabaseUpdatePassword(input: {
  newPassword: string;
  nonce?: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string; message?: string }
> {
  assertSupabaseMode();
  if (!input.newPassword || input.newPassword.length < 8) {
    return { ok: false, status: 400, error: "PASSWORD_TOO_SHORT" };
  }

  try {
    const session = await resolveSupabaseSessionUser();
    if (!session.ok) {
      if (session.error.category === "AUTH_UNAUTHENTICATED") {
        return { ok: false, status: 401, error: "AUTH_PASSWORD_RECOVERY_INVALID" };
      }
      return {
        ok: false,
        status: session.error.httpStatus,
        error: session.error.publicCode,
      };
    }

    const supabase = await createSupabaseServerClient();
    const updatePayload: { password: string; nonce?: string } = {
      password: input.newPassword,
    };
    if (input.nonce) {
      updatePayload.nonce = input.nonce;
    }

    const { error } = await supabase.auth.updateUser(updatePayload);
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        msg.includes("reauth") ||
        msg.includes("nonce") ||
        msg.includes("aal") ||
        error.code === "reauthentication_needed"
      ) {
        logAuthDiagnostic("AUTH_PASSWORD_REAUTH_REQUIRED", {
          passwordUpdateBlocked: true,
        });
        return {
          ok: false,
          status: 401,
          error: "AUTH_PASSWORD_REAUTH_REQUIRED",
          message: publicMessageForAuthError("AUTH_PASSWORD_REAUTH_REQUIRED"),
        };
      }
      logAuthDiagnostic("AUTH_PASSWORD_RECOVERY_INVALID", {
        passwordUpdateFailed: true,
      });
      return { ok: false, status: 400, error: "AUTH_PASSWORD_RECOVERY_INVALID" };
    }

    // passwordHash and sessionVersion intentionally untouched.
    return { ok: true };
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      return {
        ok: false,
        status: error.httpStatus,
        error: error.publicCode,
        message: publicMessageForAuthError(error.category),
      };
    }
    return { ok: false, status: 503, error: "AUTH_PROVIDER_UNAVAILABLE" };
  }
}

/**
 * Logged-in password change: verify current password via Supabase sign-in
 * reauthentication when Secure password change requires it, else updateUser.
 * Does not use bcrypt / passwordHash.
 */
export async function supabaseChangePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string; message?: string }
> {
  assertSupabaseMode();
  if (!input.currentPassword || !input.newPassword) {
    return { ok: false, status: 400, error: "MISSING_FIELDS" };
  }
  if (input.newPassword.length < 8) {
    return { ok: false, status: 400, error: "PASSWORD_TOO_SHORT" };
  }

  const session = await resolveSupabaseSessionUser();
  if (!session.ok) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return { ok: false, status: 401, error: "UNAUTHORIZED" };
    }

    // Re-verify current password with Supabase (not passwordHash).
    const verify = await supabase.auth.signInWithPassword({
      email: user.email,
      password: input.currentPassword,
    });
    if (verify.error) {
      return { ok: false, status: 401, error: "INVALID_PASSWORD" };
    }

    const { error } = await supabase.auth.updateUser({
      password: input.newPassword,
    });
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        msg.includes("reauth") ||
        msg.includes("nonce") ||
        error.code === "reauthentication_needed"
      ) {
        // Blocking item for cutover if Secure password change cannot be satisfied.
        logAuthDiagnostic("AUTH_PASSWORD_REAUTH_REQUIRED", {
          changePasswordBlocked: true,
        });
        return {
          ok: false,
          status: 401,
          error: "AUTH_PASSWORD_REAUTH_REQUIRED",
          message: publicMessageForAuthError("AUTH_PASSWORD_REAUTH_REQUIRED"),
        };
      }
      return { ok: false, status: 400, error: "INVALID_INPUT" };
    }

    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: "AUTH_PROVIDER_UNAVAILABLE" };
  }
}

/** PKCE / OTP callback exchange + optional provisioning. */
export async function handleAuthCallback(input: {
  code?: string | null;
  tokenHash?: string | null;
  type?: string | null;
  next?: string | null;
  req: Request;
}): Promise<NextResponse> {
  assertSupabaseMode();
  const origin = appOriginFromRequest(input.req);
  const next = safeRedirectPath(input.next, "/login");
  const errorRedirect = (reason: string) => {
    const url = new URL("/auth/error", origin);
    url.searchParams.set("reason", reason);
    const res = NextResponse.redirect(url);
    res.headers.set("Cache-Control", "no-store");
    return res;
  };

  try {
    const supabase = await createSupabaseServerClient();

    if (input.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(input.code);
      if (error) {
        const category = classifyProviderAuthError(error);
        logAuthDiagnostic(category, { callbackCodeFailed: true });
        return errorRedirect(category);
      }
    } else if (input.tokenHash && input.type) {
      const { error } = await supabase.auth.verifyOtp({
        type: input.type as EmailOtpType,
        token_hash: input.tokenHash,
      });
      if (error) {
        const category = classifyProviderAuthError(error);
        logAuthDiagnostic(category, { callbackOtpFailed: true });
        return errorRedirect(category);
      }
    } else {
      logAuthDiagnostic("AUTH_CALLBACK_INVALID", { missingCode: true });
      return errorRedirect("AUTH_CALLBACK_INVALID");
    }

    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      return errorRedirect("AUTH_UNAUTHENTICATED");
    }

    const identity: VerifiedAuthIdentity = {
      ...authIdentityFromSupabaseUser(data.user),
      // After successful confirm/recovery exchange, treat email as confirmed.
      emailConfirmed: true,
    };

    // Recovery flow: session established; password update happens on reset page.
    if (next.startsWith("/auth/reset-password")) {
      const res = NextResponse.redirect(new URL(next, origin));
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    // Signup confirmation / magic link style: ensure VectorWork user exists.
    try {
      await ensureProvisionedUserAfterAuth(prisma, identity);
    } catch (provisionError) {
      await supabase.auth.signOut().catch(() => undefined);
      if (provisionError instanceof SupabaseAuthError) {
        logAuthDiagnostic(provisionError.category, {
          callbackProvisioningFailed: true,
        });
        return errorRedirect(provisionError.category);
      }
      return errorRedirect("AUTH_PROVISIONING_FAILED");
    }

    const res = NextResponse.redirect(new URL(next, origin));
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      return errorRedirect(error.category);
    }
    logAuthDiagnostic("AUTH_PROVIDER_UNAVAILABLE", {
      callbackException: true,
    });
    return errorRedirect("AUTH_PROVIDER_UNAVAILABLE");
  }
}
