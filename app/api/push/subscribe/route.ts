import { NextResponse } from "next/server";
import { auth, db } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const sub = await req.json();

    await db.collection("push_subscriptions").doc(uid).set(
      {
        subscription: sub,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }
}