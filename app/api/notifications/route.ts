import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

export async function GET(_req: NextRequest) {
  try {
    await requireSessionUser();
    return NextResponse.json({ notifications: [] }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
