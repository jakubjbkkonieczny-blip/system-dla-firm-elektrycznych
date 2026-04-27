import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebase/admin";
import {
  clearSessionCookie,
  createSessionCookie,
  setSessionCookie,
} from "@/lib/server/auth/session";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { idToken?: unknown };
    const idToken = typeof body?.idToken === "string" ? body.idToken : "";

    if (!idToken) {
      return NextResponse.json({ error: "MISSING_ID_TOKEN" }, { status: 400 });
    }

    const decoded = await (auth as any).verifyIdToken(idToken, true);
    if (!decoded?.uid) {
      return NextResponse.json({ error: "INVALID_ID_TOKEN" }, { status: 401 });
    }
    const sessionCookie = await createSessionCookie(idToken);

    const res = NextResponse.json({ ok: true }, { status: 200 });
    return setSessionCookie(res, sessionCookie);
  } catch {
    return NextResponse.json({ error: "INVALID_ID_TOKEN" }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  return clearSessionCookie(res);
}
