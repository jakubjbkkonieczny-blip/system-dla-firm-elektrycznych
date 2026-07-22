import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
import { createNotificationForUser } from "@/lib/server/notifications/notification-service";

/**
 * Development-only manual push test. Sends only to the authenticated session user.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const sessionUser = await requireSessionUser();
    const body = await req.json().catch(() => ({}));

    const title =
      typeof body?.title === "string" && body.title.trim()
        ? body.title.trim()
        : "VectorWork — test push";
    const message =
      typeof body?.body === "string" && body.body.trim()
        ? body.body.trim()
        : "To jest testowe powiadomienie push (ETAP PUSH 1).";
    const url = typeof body?.url === "string" ? body.url : "/notifications";

    const notification = await createNotificationForUser({
      recipientUserId: sessionUser.id,
      companyId: null,
      type: "dev.test_push",
      title,
      body: message,
      url,
    });

    return NextResponse.json({
      ok: true,
      notificationId: notification.id,
    });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
