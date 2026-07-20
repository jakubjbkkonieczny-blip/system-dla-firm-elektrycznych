import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import { consumeDeactivationVerificationToken } from "@/lib/server/deactivation/email-verification";

type Body = {
  code?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const body = (await req.json()) as Body;
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!code) {
      return NextResponse.json({ error: "MISSING_CODE" }, { status: 400 });
    }

    const ok = await consumeDeactivationVerificationToken(sessionUser.id, code);
    if (!ok) {
      return NextResponse.json({ error: "INVALID_CODE" }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, () => null);
  }
}
