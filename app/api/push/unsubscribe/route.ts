import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { parsePushSubscriptionBody } from "@/lib/server/push/subscription-validation";
import { deleteUserPushSubscription } from "@/lib/server/push/subscription-store";

function pushRouteErrorStatus(message: string): number | null {
  if (message.startsWith("INVALID_SUBSCRIPTION")) return 400;
  return null;
}

export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const body = await req.json();
    const subscription = parsePushSubscriptionBody(body);

    const result = await deleteUserPushSubscription(sessionUser.id, subscription.endpoint);

    if (result.reason === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, deleted: result.deleted });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    if (msg === "MISSING_AUTH") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const mapped = pushRouteErrorStatus(msg);
    if (mapped !== null) {
      return NextResponse.json({ error: msg }, { status: mapped });
    }
    console.error(e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
