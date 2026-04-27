import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

export async function PATCH(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const body = (await req.json()) as { displayName?: string };

    const displayName = String(body?.displayName || "").trim();

    if (!displayName) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { displayName },
    });

    return NextResponse.json({ ok: true, displayName }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
