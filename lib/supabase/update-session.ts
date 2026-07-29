/**
 * Official @supabase/ssr Proxy helper — refresh Auth cookies when Supabase mode is on.
 * Sources:
 * - https://supabase.com/docs/guides/auth/server-side/creating-a-client
 * - https://supabase.com/docs/guides/auth/server-side/nextjs
 *
 * Does NOT perform business authorization. Route handlers still call requireSessionUser().
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";

export type SupabaseProxyResult = {
  response: NextResponse;
  /** True when getClaims() verified an authenticated subject. */
  hasVerifiedAuth: boolean;
};

/**
 * When Supabase Auth is enabled and public env is present, refresh the session.
 * When disabled or unconfigured, returns next() without touching Supabase.
 */
export async function updateSupabaseSession(
  request: NextRequest,
  baseResponse?: NextResponse
): Promise<SupabaseProxyResult> {
  let response =
    baseResponse ??
    NextResponse.next({
      request,
    });

  if (!isSupabaseAuthEnabled()) {
    return { response, hasVerifiedAuth: false };
  }

  const env = getSupabasePublicEnv();
  if (!env) {
    // Fail closed for protected paths is handled by the caller using hasVerifiedAuth.
    return { response, hasVerifiedAuth: false };
  }

  let hasVerifiedAuth = false;

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        }
      },
    },
  });

  // Official guidance: validate JWT via getClaims() in Proxy (do not trust getSession alone).
  try {
    const { data, error } = await supabase.auth.getClaims();
    hasVerifiedAuth = Boolean(!error && data?.claims?.sub);
  } catch {
    hasVerifiedAuth = false;
  }

  return { response, hasVerifiedAuth };
}
