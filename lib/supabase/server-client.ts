/**
 * Server Supabase client factory — Phase 1 scaffolding.
 *
 * NOT wired into getUserFromSession, middleware, or API auth.
 * Cookie adapter follows official @supabase/ssr + Next.js App Router pattern.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireSupabasePublicEnv } from "@/lib/supabase/env";

export async function createSupabaseServerClient() {
  const { url, publishableKey } = requireSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies; future Proxy/middleware refreshes sessions.
        }
      },
    },
  });
}
