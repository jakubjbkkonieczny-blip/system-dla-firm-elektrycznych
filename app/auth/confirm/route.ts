import { NextRequest, NextResponse } from "next/server";

import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import { handleAuthCallback } from "@/lib/supabase/auth-actions";
import { safeRedirectPath } from "@/lib/supabase/safe-redirect";

/**
 * GET /auth/confirm
 * Token-hash email confirmation endpoint (Supabase email template PKCE variant).
 * Official pattern: verifyOtp({ type, token_hash }).
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

  return handleAuthCallback({
    tokenHash: searchParams.get("token_hash"),
    type: searchParams.get("type"),
    next: safeRedirectPath(searchParams.get("next"), "/login"),
    req: request,
  });
}

export async function POST() {
  return NextResponse.json(
    { error: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } }
  );
}
