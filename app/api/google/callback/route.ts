import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";

export async function GET(req: NextRequest) {
  try {
    const uid = await requireAuthUid(req);
    const code = req.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.redirect("/settings");
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

    await adminDb.collection("users").doc(uid).set(
      {
        google: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        },
      },
      { merge: true }
    );

    return NextResponse.redirect("/calendar");
  } catch {
    return NextResponse.redirect("/settings");
  }
}