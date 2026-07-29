import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import { supabaseChangePassword } from "@/lib/supabase/auth-actions";
import { SupabaseAuthError } from "@/lib/supabase/errors";

type Body = {
  currentPassword?: unknown;
  newPassword?: unknown;
  /** Ignored — identity comes only from the verified session. */
  userId?: unknown;
};

export async function PATCH(req: NextRequest) {
  if (isSupabaseAuthEnabled()) {
    try {
      await requireSessionUser();
      const body = (await req.json()) as Body;
      // Explicitly ignore any client-supplied userId.
      void body.userId;

      const currentPassword =
        typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

      const result = await supabaseChangePassword({
        currentPassword,
        newPassword,
      });
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
      return handleSessionRouteError(e);
    }
  }

  try {
    const sessionUser = await requireSessionUser();
    const body = (await req.json()) as Body;

    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
