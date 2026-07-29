/**
 * Phase 0 verification — Supabase Auth external dependencies
 *
 * Source of truth: official Supabase documentation (retrieved 2026-07-29).
 * Status values: CONFIRMED | REQUIRES DIFFERENT APPROACH
 *
 * This is NOT an architecture redesign. It records product API facts needed
 * before later cutover phases. Neon remains the production database.
 */

export type Phase0DependencyStatus = "CONFIRMED" | "REQUIRES DIFFERENT APPROACH";

export type Phase0Dependency = {
  id: string;
  topic: string;
  status: Phase0DependencyStatus;
  officialSources: readonly string[];
  implicationForVectorWork: string;
};

/**
 * Password strategy for a future cutover phase (not executed in Phase 0/1).
 * Official admin createUser accepts `password_hash` for bcrypt/argon2/scrypt.
 * Forced password-reset remains the documented fallback if import fails in rehearsal.
 */
export const SUPABASE_PASSWORD_MIGRATION_STRATEGY =
  "bcrypt_import_with_reset_fallback" as const;

export const PHASE_0_DEPENDENCIES: readonly Phase0Dependency[] = [
  {
    id: "bcrypt-hash-import",
    topic: "bcrypt password hash import via Auth Admin createUser",
    status: "CONFIRMED",
    officialSources: [
      "https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0",
      "https://supabase.github.io/auth-js/v2/interfaces/AdminUserAttributes.html",
    ],
    implicationForVectorWork:
      "Future password migration may call admin.createUser({ email, password_hash, email_confirm: true }). " +
      "VectorWork uses node bcrypt (cost 10). Official docs support bcrypt; staging must validate real hash prefixes ($2a$/$2b$) before production import. " +
      "Fallback remains forced password reset via resetPasswordForEmail.",
  },
  {
    id: "auth-admin-apis",
    topic: "Auth Admin APIs (createUser, updateUserById, deleteUser)",
    status: "CONFIRMED",
    officialSources: [
      "https://supabase.com/docs/reference/javascript/auth-admin-createuser",
      "https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid",
    ],
    implicationForVectorWork:
      "Server-only service-role client is required for provisioning, ban/disable, and email_confirm. Never expose service role to the browser.",
  },
  {
    id: "ssr-app-router",
    topic: "SSR App Router integration via @supabase/ssr",
    status: "CONFIRMED",
    officialSources: [
      "https://supabase.com/docs/guides/auth/server-side/creating-a-client",
      "https://www.npmjs.com/package/@supabase/ssr",
    ],
    implicationForVectorWork:
      "Use createBrowserClient + createServerClient from @supabase/ssr with Next.js cookie adapters. " +
      "Official env names: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Token refresh requires a Next.js Proxy/middleware layer at cutover — not wired in Phase 1.",
  },
  {
    id: "session-handling",
    topic: "Session handling (cookies, getClaims / getUser / getSession)",
    status: "CONFIRMED",
    officialSources: [
      "https://supabase.com/docs/guides/auth/server-side/creating-a-client",
    ],
    implicationForVectorWork:
      "Server identity checks should use getClaims() (JWT validation) or getUser(); do not trust getSession() user object alone on the server. " +
      "Legacy HMAC cookie sessions remain authoritative until a later cutover phase.",
  },
  {
    id: "password-recovery",
    topic: "Password recovery",
    status: "CONFIRMED",
    officialSources: [
      "https://supabase.com/docs/guides/auth/passwords",
      "https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail",
    ],
    implicationForVectorWork:
      "Use auth.resetPasswordForEmail + updateUser({ password }) after PASSWORD_RECOVERY. Replace custom reset only in a later phase.",
  },
  {
    id: "email-verification",
    topic: "Email verification on signup",
    status: "CONFIRMED",
    officialSources: [
      "https://supabase.com/docs/guides/auth/passwords",
      "https://supabase.com/docs/reference/javascript/auth-signup",
    ],
    implicationForVectorWork:
      "Hosted projects confirm email by default. Admin can set email_confirm on create/update. VectorWork VerificationToken flows stay until Auth cutover owns verification.",
  },
  {
    id: "user-disable-suspension",
    topic: "User disabling / suspension (ban_duration)",
    status: "CONFIRMED",
    officialSources: [
      "https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid",
      "https://supabase.github.io/auth-js/v2/interfaces/AdminUserAttributes.html",
    ],
    implicationForVectorWork:
      "admin.updateUserById(id, { ban_duration: '876000h' }) bans; ban_duration: 'none' lifts. Units are ns/us/ms/s/m/h (not years). " +
      "VectorWork isActive / deactivation / tombstone remain business authority; Auth ban is an additional Auth-side gate in later phases.",
  },
  {
    id: "reauthentication",
    topic: "Reauthentication before sensitive password change",
    status: "CONFIRMED",
    officialSources: [
      "https://supabase.com/docs/reference/javascript/auth-reauthenticate",
      "https://supabase.github.io/auth-js/v2/interfaces/AdminUserAttributes.html",
    ],
    implicationForVectorWork:
      "auth.reauthenticate() sends a nonce; updateUser({ password, nonce }) when Secure password change is enabled. " +
      "Maps to future replacement of bcrypt.compare in deactivation finalization — not in Phase 1.",
  },
] as const;

export function getPhase0Dependency(id: string): Phase0Dependency | undefined {
  return PHASE_0_DEPENDENCIES.find((dependency) => dependency.id === id);
}

export function assertAllPhase0DependenciesResolved(): void {
  const unresolved = PHASE_0_DEPENDENCIES.filter(
    (dependency) => dependency.status === "REQUIRES DIFFERENT APPROACH"
  );
  if (unresolved.length > 0) {
    throw new Error(
      `Phase 0 unresolved dependencies: ${unresolved.map((d) => d.id).join(", ")}`
    );
  }
}
