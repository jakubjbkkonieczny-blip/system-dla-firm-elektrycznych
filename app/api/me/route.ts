import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { getMeData } from "@/lib/server/me/get-me";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
import { clearSessionCookie } from "@/lib/server/auth/session";

export async function GET(_req: NextRequest) {
  try {
    const data = await getMeData();
    return NextResponse.json(data, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();

    if (sessionUser.accountRole === "employer") {
      return NextResponse.json(
        { error: "USE_DEACTIVATION_FINAL_ENDPOINT" },
        { status: 403 }
      );
    }

    const now = new Date();
    const updated = await prisma.user.updateMany({
      where: { id: sessionUser.id, isActive: true },
      data: {
        isActive: false,
        deactivatedAt: now,
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ ok: true, status: "already_deactivated" }, { status: 200 });
    }

    const res = NextResponse.json({ ok: true }, { status: 200 });
    return clearSessionCookie(res);
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
