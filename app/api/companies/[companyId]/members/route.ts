import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, uid);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const snap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("members")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const members = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        uid: d.id,
        email: data.email || "",
        role: data.role || "staff",
        scope: data.scope || "all",
        active: data.active === true,
        createdAt: data.createdAt || null,
      };
    });

    return NextResponse.json({ members }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}