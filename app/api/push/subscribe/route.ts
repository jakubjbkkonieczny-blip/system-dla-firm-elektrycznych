import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import { parsePushSubscriptionBody } from "@/lib/server/push/subscription-validation";
import { upsertUserPushSubscription } from "@/lib/server/push/subscription-store";

function pushRouteErrorStatus(message: string): number | null {
  if (message.startsWith("INVALID_SUBSCRIPTION")) return 400;
  return null;
}

export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const body = await req.json();

    if (body && typeof body === "object" && "userId" in body) {
      throw new Error("INVALID_SUBSCRIPTION:userId_not_allowed");
    }

    const subscription = parsePushSubscriptionBody(body);
    const userAgent = req.headers.get("user-agent");

    const record = await upsertUserPushSubscription(
      sessionUser.id,
      subscription,
      userAgent
    );

    return NextResponse.json({
      ok: true,
      id: record.id,
      endpoint: record.endpoint,
    });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, pushRouteErrorStatus);
  }
}
