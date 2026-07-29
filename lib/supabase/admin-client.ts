/**
 * Supabase Auth Admin client — Phase 1 scaffolding.
 *
 * Uses the service role key. Server-only. Never import from Client Components.
 * NOT used for login, register, ban, or provisioning in Phase 1.
 */

import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireSupabaseAdminEnv } from "@/lib/supabase/env";

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = requireSupabaseAdminEnv();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
