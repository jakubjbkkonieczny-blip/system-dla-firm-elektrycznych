import { NextRequest, NextResponse } from "next/server";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(req: NextRequest) {
  try {
    const uid = await requireAuthUid(req);

    const snap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("notifications")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const notifications = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    return NextResponse.json({ notifications });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}