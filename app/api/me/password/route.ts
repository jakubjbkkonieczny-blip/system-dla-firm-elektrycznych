import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

type Body = {
  currentPassword?: unknown;
  newPassword?: unknown;
};

export async function PATCH(req: NextRequest) {
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

    if (!user) {
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
