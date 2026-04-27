import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import {
  clearSessionCookie,
  createSignedSessionToken,
  setSessionCookie,
} from "@/lib/server/auth/session";

type Body = {
  email?: unknown;
  password?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "MISSING_CREDENTIALS" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: "ACCOUNT_DISABLED" }, { status: 403 });
    }

    const sessionToken = createSignedSessionToken(user.id);
    const res = NextResponse.json({ ok: true }, { status: 200 });
    return setSessionCookie(res, sessionToken);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  return clearSessionCookie(res);
}
