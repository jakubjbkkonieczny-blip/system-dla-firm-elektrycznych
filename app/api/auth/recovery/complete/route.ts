import { NextRequest, NextResponse } from "next/server";

import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import { supabaseUpdatePassword } from "@/lib/supabase/auth-actions";
import { SupabaseAuthError } from "@/lib/supabase/errors";

type Body = {
  newPassword?: unknown;
  password?: unknown;
  nonce?: unknown;
};

/**
 * POST /api/auth/recovery/complete
 * Completes password recovery using a valid Supabase recovery session.
 * Does not update passwordHash or sessionVersion.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseAuthEnabled()) {
    return NextResponse.json(
      { error: "AUTH_MODE_MISMATCH" },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = (await req.json()) as Body;
    const newPassword =
      typeof body.newPassword === "string"
        ? body.newPassword
        : typeof body.password === "string"
          ? body.password
          : "";
    const nonce = typeof body.nonce === "string" ? body.nonce : undefined;

    const result = await supabaseUpdatePassword({ newPassword, nonce });
    if (!result.ok) {
      const payload: Record<string, string> = { error: result.error };
      if (result.message) payload.message = result.message;
      return NextResponse.json(payload, {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    if (e instanceof SupabaseAuthError) {
      return NextResponse.json(
        { error: e.publicCode },
        { status: e.httpStatus, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}
