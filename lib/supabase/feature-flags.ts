/**
 * Supabase Auth feature flags.
 *
 * Default: OFF. Exact env value "true" selects the Supabase Auth adapter.
 * Any other value keeps the legacy HMAC auth path. No silent fallback.
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
