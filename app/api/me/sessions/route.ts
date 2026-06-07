import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
import {
  clearSessionCookie,
  createSignedSessionToken,
  setSessionCookie,
} from "@/lib/server/auth/session";

export async function DELETE() {
  try {
    const sessionUser = await requireSessionUser();

    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });

    const sessionToken = createSignedSessionToken(sessionUser.id, updated.sessionVersion);
    const res = NextResponse.json({ ok: true }, { status: 200 });
    return setSessionCookie(res, sessionToken);
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}

/** Revoke all other sessions and keep the current one. */
export async function POST() {
  try {
    const sessionUser = await requireSessionUser();

    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });

    const sessionToken = createSignedSessionToken(sessionUser.id, updated.sessionVersion);
    const res = NextResponse.json({ ok: true }, { status: 200 });
    return setSessionCookie(res, sessionToken);
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
