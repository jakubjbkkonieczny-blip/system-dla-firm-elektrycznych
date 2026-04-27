import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const code = req.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.redirect(new URL("/settings", req.url));
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const data = await tokenRes.json();

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        googleAccessToken: data.access_token ?? null,
        googleRefreshToken: data.refresh_token ?? null,
      },
    });

    return NextResponse.redirect(new URL("/calendar", req.url));
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "MISSING_AUTH") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    console.error(e);
    return NextResponse.redirect(new URL("/settings", req.url));
  }
}
