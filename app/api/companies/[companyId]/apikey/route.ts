import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { randomApiKey, sha256 } from "@/app/api/_lib/crypto";

type Ctx = { params: Promise<{ companyId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId } = await params;

    const member = await requireActiveMember(companyId, uid);
    if (!["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const apiKey = randomApiKey();
    const apiKeyHash = sha256(apiKey);

    await adminDb.collection("companies").doc(companyId).set(
      {
        apiKeyHash,
        apiKeyUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // UWAGA: apiKey pokazujemy TYLKO raz (tu). Hash zostaje w bazie.
    return NextResponse.json({ apiKey }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
