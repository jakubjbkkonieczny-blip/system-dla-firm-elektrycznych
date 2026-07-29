/**
 * Phase 1 public surface for unused Supabase Auth scaffolding.
 *
 * Do not import from legacy auth routes. Cutover phases will wire these deliberately.
 */

export {
  PHASE_0_DEPENDENCIES,
  SUPABASE_PASSWORD_MIGRATION_STRATEGY,
  assertAllPhase0DependenciesResolved,
  getPhase0Dependency,
} from "@/lib/supabase/phase0-dependencies";
export type {
  Phase0Dependency,
  Phase0DependencyStatus,
} from "@/lib/supabase/phase0-dependencies";

export {
  SUPABASE_AUTH_ENABLED_ENV,
  isSupabaseAuthEnabled,
} from "@/lib/supabase/feature-flags";

export {
  SUPABASE_URL_ENV,
  SUPABASE_PUBLISHABLE_KEY_ENV,
  SUPABASE_SERVICE_ROLE_KEY_ENV,
  getSupabasePublicEnv,
  getSupabaseAdminEnv,
  requireSupabasePublicEnv,
  requireSupabaseAdminEnv,
} from "@/lib/supabase/env";
export type { SupabasePublicEnv, SupabaseAdminEnv } from "@/lib/supabase/env";

export {
  findUserBySupabaseAuthUserId,
  linkUserToSupabaseAuthUser,
  unlinkUserSupabaseAuthUserId,
} from "@/lib/supabase/auth-user-mapping";
export type {
  AuthUserMappingClient,
  LinkedAuthUser,
} from "@/lib/supabase/auth-user-mapping";
