/**
 * Server Supabase client factory for Server Components, Route Handlers, Server Actions.
 * Cookie adapter follows official @supabase/ssr + Next.js App Router pattern
 * (getAll / setAll only — never deprecated get/set/remove).
 *
 * Official sources (2026-07-29):
 * https://supabase.com/docs/guides/auth/server-side/creating-a-client
 * https://supabase.com/docs/guides/auth/server-side/nextjs
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
      setAll(cookiesToSet, _headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies; Proxy refreshes sessions.
        }
      },
    },
  });
}
