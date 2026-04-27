import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

export async function GET(_request: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { googleAccessToken: true },
    });

    if (!user?.googleAccessToken) {
      return NextResponse.json({ error: "NO_GOOGLE" }, { status: 400 });
    }

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        headers: {
          Authorization: `Bearer ${user.googleAccessToken}`,
        },
      }
    );

    const data = await res.json();

    return NextResponse.json({ events: data.items || [] });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
