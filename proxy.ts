import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import { logRequestSummary } from "@/lib/server/request-log";
import { isSupabaseAuthEnabled } from "@/lib/supabase/feature-flags";
import { updateSupabaseSession } from "@/lib/supabase/update-session";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function withApiLog(req: NextRequest, startedAt: number, res: NextResponse): NextResponse {
  logRequestSummary({
    method: req.method,
    path: req.nextUrl.pathname,
    status: res.status,
    durationMs: Date.now() - startedAt,
  });
  return res;
}

export async function proxy(request: NextRequest) {
  const startedAt = Date.now();
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const supabaseMode = isSupabaseAuthEnabled();

  if (isApi) {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      const response = NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
      response.headers.set("Retry-After", String(rl.retryAfterSeconds));
      return withApiLog(request, startedAt, response);
    }
  }

  // Public auth API routes must stay accessible without session.
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    if (supabaseMode) {
      const { response } = await updateSupabaseSession(request);
      return isApi ? withApiLog(request, startedAt, response) : response;
    }
    const response = NextResponse.next();
    return isApi ? withApiLog(request, startedAt, response) : response;
  }

  if (supabaseMode) {
    const { response, hasVerifiedAuth } = await updateSupabaseSession(request);

    if (hasVerifiedAuth) {
      return isApi ? withApiLog(request, startedAt, response) : response;
    }

    // No verified Supabase session — same gate as legacy, without trusting cookie presence alone.
    if (pathname.startsWith("/api/")) {
      const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      // Preserve any refreshed Set-Cookie clears from updateSession.
      response.cookies.getAll().forEach((c) => unauthorized.cookies.set(c.name, c.value));
      return withApiLog(request, startedAt, unauthorized);
    }

    const loginUrl = new URL("/login", request.url);
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
    return redirect;
  }

  // Legacy mode: HMAC session cookie presence gate (final auth still in route handlers).
  const session = request.cookies.get("session")?.value;

  if (session) {
    const response = NextResponse.next();
    return isApi ? withApiLog(request, startedAt, response) : response;
  }

  if (pathname.startsWith("/api/")) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return withApiLog(request, startedAt, response);
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*", "/companies/:path*"],
};
