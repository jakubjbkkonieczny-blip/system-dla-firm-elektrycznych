import { NextRequest, NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { getMeData } from "@/lib/server/me/get-me";
import { resolveManualSelfDelete } from "@/lib/server/me/self-delete-guard";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

export async function GET(_req: NextRequest) {
  try {
    const data = await getMeData();
    return NextResponse.json(data, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const decision = resolveManualSelfDelete(sessionUser.accountRole);

    return NextResponse.json({ error: decision.error }, { status: decision.status });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
