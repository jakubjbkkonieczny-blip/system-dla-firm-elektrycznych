import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
import { isUserTheme } from "@/lib/theme/types";

type Body = {
  theme?: unknown;
};

export async function PATCH(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const body = (await req.json()) as Body;

    if (!isUserTheme(body.theme)) {
      return NextResponse.json({ error: "INVALID_THEME" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: { theme: body.theme },
      select: { theme: true },
    });

    return NextResponse.json({ theme: updated.theme }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
