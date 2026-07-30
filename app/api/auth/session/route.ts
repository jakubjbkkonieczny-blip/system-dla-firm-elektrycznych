import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import {
  clearSessionCookie,
  createSignedSessionToken,
  setSessionCookie,
} from "@/lib/server/auth/session";
import { setDeactivatedAccessCookie } from "@/lib/server/deactivation/deactivated-account-access";
import { mintDeactivatedAccessForUser } from "@/lib/server/deactivation/mint-deactivated-access";
import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import { supabaseLogin, supabaseLogout } from "@/lib/supabase/auth-actions";
import { SupabaseAuthError } from "@/lib/supabase/errors";

type Body = {
  email?: unknown;
  password?: unknown;
};

export async function POST(req: NextRequest) {
  if (isSupabaseAuthEnabled()) {
    try {
      const body = (await req.json()) as Body;
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const result = await supabaseLogin({ email, password });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      if (result.deactivated === true) {
        // Auth session already revoked in supabaseLogin; mint recovery capability only.
        const minted = await mintDeactivatedAccessForUser(result.userId);
        if (!minted.ok) {
          return NextResponse.json({ error: "ACCOUNT_DISABLED" }, { status: 403 });
        }
        const res = NextResponse.json({ ok: true, deactivated: true }, { status: 200 });
        res.headers.set("Cache-Control", "no-store");
        return setDeactivatedAccessCookie(res, minted.token);
      }
      // Supabase cookies already set by signInWithPassword via server client.
      // Do NOT mint legacy HMAC session.
      const res = NextResponse.json({ ok: true }, { status: 200 });
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (e: unknown) {
      if (e instanceof SupabaseAuthError) {
        return NextResponse.json({ error: e.publicCode }, { status: e.httpStatus });
      }
      console.error("[supabase-auth]", { category: "AUTH_PROVIDER_UNAVAILABLE" });
      return NextResponse.json({ error: "AUTH_PROVIDER_UNAVAILABLE" }, { status: 503 });
    }
  }

  try {
    const body = (await req.json()) as Body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "MISSING_CREDENTIALS" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    if (!user.isActive) {
      const minted = await mintDeactivatedAccessForUser(user.id);
      if (minted.ok) {
        const res = NextResponse.json({ ok: true, deactivated: true }, { status: 200 });
        return setDeactivatedAccessCookie(res, minted.token);
      }
      return NextResponse.json({ error: "ACCOUNT_DISABLED" }, { status: 403 });
    }

    const sessionToken = createSignedSessionToken(user.id, user.sessionVersion);
    const res = NextResponse.json({ ok: true }, { status: 200 });
    return setSessionCookie(res, sessionToken);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}

export async function DELETE() {
  if (isSupabaseAuthEnabled()) {
    try {
      const res = await supabaseLogout();
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (e: unknown) {
      if (e instanceof SupabaseAuthError) {
        return NextResponse.json({ error: e.publicCode }, { status: e.httpStatus });
      }
      const res = NextResponse.json({ ok: true }, { status: 200 });
      return clearSessionCookie(res);
    }
  }

  const res = NextResponse.json({ ok: true }, { status: 200 });
  return clearSessionCookie(res);
}
