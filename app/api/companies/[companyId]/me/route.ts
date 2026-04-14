import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, uid);

    const companySnap = await adminDb.collection("companies").doc(companyId).get();
    if (!companySnap.exists) return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const data = companySnap.data() as any;

    return NextResponse.json(
      {
        role: me.role,
        scope: me.scope,
        activeMembersCount: Number(data?.activeMembersCount || 0),
        membersCount: Number(data?.membersCount || 0),
      },
      { status: 200 }
    );
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}