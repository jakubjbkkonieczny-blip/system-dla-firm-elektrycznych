import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const sub = await req.json();

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { pushSubscription: sub as object },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
