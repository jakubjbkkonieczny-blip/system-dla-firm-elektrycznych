/**
 * Browser Supabase client factory — Phase 1 scaffolding.
 *
 * NOT wired into AuthProvider, login, register, or any UI.
 * Safe to import from Client Components once cutover begins.
 */

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabasePublicEnv } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = requireSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
