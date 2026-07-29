import { NextRequest, NextResponse } from "next/server";

import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import { supabaseRequestPasswordRecovery } from "@/lib/supabase/auth-actions";
import { SupabaseAuthError } from "@/lib/supabase/errors";

type Body = {
  email?: unknown;
};

/**
 * POST /api/auth/forgot-password
 * Supabase mode: resetPasswordForEmail (generic response).
 * Legacy mode: stub success (legacy had no real reset) — no account enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (isSupabaseAuthEnabled()) {
      await supabaseRequestPasswordRecovery({ email, req });
    }

    // Identical public response whether or not the account exists / mode.
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    if (e instanceof SupabaseAuthError) {
      // Still return generic ok for recovery request to avoid enumeration,
      // except hard configuration failures in staging.
      if (e.category === "AUTH_CONFIGURATION_ERROR") {
        return NextResponse.json(
          { error: e.publicCode },
          { status: e.httpStatus, headers: { "Cache-Control": "no-store" } }
        );
      }
    }
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}
