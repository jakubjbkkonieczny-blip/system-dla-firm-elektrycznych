/**
 * Public surface for Supabase Auth (Stage 2A implementation / Stage 3A staging).
 *
 * Browser/server/admin client factories are NOT re-exported here to avoid
 * accidental bundling of server-only modules into client code.
 * Import client factories from their dedicated modules.
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

export {
  AUTH_ERROR_CATEGORIES,
  SupabaseAuthError,
  publicMessageForAuthError,
  classifyProviderAuthError,
} from "@/lib/supabase/errors";
export type { AuthErrorCategory } from "@/lib/supabase/errors";

export {
  DEFAULT_SAFE_REDIRECT_PATH,
  safeRedirectPath,
  isSafeRedirectPath,
} from "@/lib/supabase/safe-redirect";

export {
  normalizeAuthEmail,
  provisionNewUserFromAuth,
  linkExistingUserToAuth,
  ensureProvisionedUserAfterAuth,
  resolveLinkedUser,
} from "@/lib/supabase/provisioning";
export type {
  VerifiedAuthIdentity,
  ProvisionedUser,
  ProvisioningClient,
} from "@/lib/supabase/provisioning";

export { getAuthMode } from "@/lib/supabase/auth-adapter";
export type { AuthMode } from "@/lib/supabase/auth-adapter";
