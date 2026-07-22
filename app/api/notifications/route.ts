import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
import {
  listNotificationsForUser,
  markNotificationReadForUser,
} from "@/lib/server/notifications/queries";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const url = req.nextUrl;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

    const result = await listNotificationsForUser({
      userId: sessionUser.id,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const body = await req.json().catch(() => ({}));
    const notificationId =
      typeof body?.notificationId === "string" ? body.notificationId : null;

    if (!notificationId) {
      return NextResponse.json({ error: "NOTIFICATION_ID_REQUIRED" }, { status: 400 });
    }

    const result = await markNotificationReadForUser(sessionUser.id, notificationId);

    if (result.reason === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (result.reason === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, updated: result.updated });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
