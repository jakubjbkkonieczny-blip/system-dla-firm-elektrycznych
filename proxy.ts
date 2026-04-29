import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";

import { logRequestSummary } from "@/lib/server/request-log";



function getClientIp(req: NextRequest): string {

  const forwarded = req.headers.get("x-forwarded-for");

  if (forwarded) {

    const first = forwarded.split(",")[0]?.trim();

    if (first) return first;

  }

  return req.headers.get("x-real-ip") ?? req.ip ?? "0.0.0.0";

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



export function proxy(request: NextRequest) {

  const startedAt = Date.now();

  const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith("/api/");



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

    const response = NextResponse.next();

    return isApi ? withApiLog(request, startedAt, response) : response;

  }



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

