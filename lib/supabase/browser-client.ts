/**
 * Browser Supabase client factory.
 * Safe to import from Client Components. Uses publishable key only.
 *
 * Official source:
 * https://supabase.com/docs/guides/auth/server-side/creating-a-client
 */

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabasePublicEnv } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = requireSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
