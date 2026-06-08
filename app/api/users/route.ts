import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

export async function GET() {
  try {
    await requireSessionUser();
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
