import { NextRequest, NextResponse } from "next/server";

import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import { handleAuthCallback } from "@/lib/supabase/auth-actions";
import { SupabaseAuthError } from "@/lib/supabase/errors";
import { safeRedirectPath } from "@/lib/supabase/safe-redirect";

/**
 * GET /auth/callback
 * PKCE code exchange and/or email OTP token_hash verification.
 * Official SSR callback for signup confirmation and password recovery.
 *
 * Query: code | token_hash+type | next (safe internal path only)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (!isSupabaseAuthEnabled()) {
    const url = new URL("/auth/error", request.url);
    url.searchParams.set("reason", "AUTH_MODE_MISMATCH");
    return NextResponse.redirect(url, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    return await handleAuthCallback({
      code: searchParams.get("code"),
      tokenHash: searchParams.get("token_hash"),
      type: searchParams.get("type"),
      next: safeRedirectPath(searchParams.get("next"), "/login"),
      req: request,
    });
  } catch (e: unknown) {
    const url = new URL("/auth/error", request.url);
    if (e instanceof SupabaseAuthError) {
      url.searchParams.set("reason", e.category);
    } else {
      url.searchParams.set("reason", "AUTH_PROVIDER_UNAVAILABLE");
    }
    return NextResponse.redirect(url, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } }
  );
}
