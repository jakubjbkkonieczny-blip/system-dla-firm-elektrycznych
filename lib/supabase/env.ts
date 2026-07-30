/**
 * Public / server Supabase env helpers.
 *
 * Used by Stage 2A+ Auth clients when SUPABASE_AUTH_ENABLED=true.
 * When the flag is off, callers must not require these values (legacy auth).
 *
 * Official Next.js names (docs verified Stage 3A):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * Service role (server-only, never NEXT_PUBLIC_):
 * - SUPABASE_SERVICE_ROLE_KEY
 */

export const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
export const SUPABASE_PUBLISHABLE_KEY_ENV = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
export const SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";

export type EnvLike = Record<string, string | undefined>;

export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
};

export type SupabaseAdminEnv = SupabasePublicEnv & {
  serviceRoleKey: string;
};

function readRequired(env: EnvLike, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

/** Reads public Supabase env. Returns null when incomplete (safe for unused scaffolding). */
export function getSupabasePublicEnv(
  env: EnvLike = process.env
): SupabasePublicEnv | null {
  const url = readRequired(env, SUPABASE_URL_ENV);
  const publishableKey = readRequired(env, SUPABASE_PUBLISHABLE_KEY_ENV);
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

/** Reads admin (service role) env. Returns null when incomplete. */
export function getSupabaseAdminEnv(
  env: EnvLike = process.env
): SupabaseAdminEnv | null {
  const publicEnv = getSupabasePublicEnv(env);
  const serviceRoleKey = readRequired(env, SUPABASE_SERVICE_ROLE_KEY_ENV);
  if (!publicEnv || !serviceRoleKey) return null;
  return { ...publicEnv, serviceRoleKey };
}

/** Throws when public env is missing. Used by Auth client factories in Supabase mode. */
export function requireSupabasePublicEnv(
  env: EnvLike = process.env
): SupabasePublicEnv {
  const resolved = getSupabasePublicEnv(env);
  if (!resolved) {
    throw new Error(
      `Missing Supabase public env: ${SUPABASE_URL_ENV}, ${SUPABASE_PUBLISHABLE_KEY_ENV}`
    );
  }
  return resolved;
}

/** Throws when admin env is missing. Admin client is cutover/migration only — not login. */
export function requireSupabaseAdminEnv(
  env: EnvLike = process.env
): SupabaseAdminEnv {
  const resolved = getSupabaseAdminEnv(env);
  if (!resolved) {
    throw new Error(
      `Missing Supabase admin env: ${SUPABASE_URL_ENV}, ${SUPABASE_PUBLISHABLE_KEY_ENV}, ${SUPABASE_SERVICE_ROLE_KEY_ENV}`
    );
  }
  return resolved;
}
