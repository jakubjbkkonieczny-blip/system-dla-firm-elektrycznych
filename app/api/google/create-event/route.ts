import { NextResponse, NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";

export async function POST(request: NextRequest) {
  try {
    const uid = await requireAuthUid(request);
    const body = await request.json();

    const snap = await adminDb.collection("users").doc(uid).get();
    const google = snap.data()?.google;

    if (!google?.accessToken) {
      return NextResponse.json({ error: "NO_GOOGLE" }, { status: 400 });
    }

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${google.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: body.title,
          description: body.description,
          start: { dateTime: body.start },
          end: { dateTime: body.end },
        }),
      }
    );

    const data = await res.json();

    return NextResponse.json({ event: data });
  } catch {
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }
}