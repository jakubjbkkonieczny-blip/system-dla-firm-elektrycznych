/**
 * Supabase Auth feature flags — Phase 1 scaffolding only.
 *
 * Default: OFF. No request path may enable Supabase Auth until a later cutover phase.
 * Setting SUPABASE_AUTH_ENABLED=true must not change behavior while no callers exist.
 */

export const SUPABASE_AUTH_ENABLED_ENV = "SUPABASE_AUTH_ENABLED";

type EnvLike = Record<string, string | undefined>;

/**
 * Returns true only when explicitly enabled via env (`"true"`).
 * Missing / empty / any other value → false (legacy auth remains sole path).
 */
export function isSupabaseAuthEnabled(env: EnvLike = process.env): boolean {
  return env[SUPABASE_AUTH_ENABLED_ENV]?.trim() === "true";
}
