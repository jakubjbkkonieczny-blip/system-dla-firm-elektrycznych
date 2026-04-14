import { NextResponse, NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";

export async function GET(request: NextRequest) {
  try {
    const uid = await requireAuthUid(request);

    const snap = await adminDb.collection("users").doc(uid).get();
    const google = snap.data()?.google;

    if (!google?.accessToken) {
      return NextResponse.json({ error: "NO_GOOGLE" }, { status: 400 });
    }

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        headers: {
          Authorization: `Bearer ${google.accessToken}`,
        },
      }
    );

    const data = await res.json();

    return NextResponse.json({ events: data.items || [] });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }
}