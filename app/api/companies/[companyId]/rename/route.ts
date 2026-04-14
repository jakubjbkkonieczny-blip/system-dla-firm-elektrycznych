import { NextRequest, NextResponse } from "next/server";
import { adminDb, auth } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const { companyId } = await params;

    const me = await requireActiveMember(companyId, uid);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();

    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    await adminDb.collection("companies").doc(companyId).set(
      {
        name,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "RENAME_ERROR" }, { status: 500 });
  }
}