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

    await requireActiveMember(companyId, uid);

    const membersSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("members")
      .where("active", "==", true)
      .get();

    const rawMembers = membersSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        uid: d.id,
        email: data.email || "",
        role: data.role || "staff",
      };
    });

    const userRefs = rawMembers.map((m) => adminDb.collection("users").doc(m.uid));
    const userSnaps = userRefs.length ? await adminDb.getAll(...userRefs) : [];

    const displayNameMap = new Map<string, string>();
    for (const snap of userSnaps) {
      const data = snap.exists ? (snap.data() as any) : null;
      displayNameMap.set(snap.id, String(data?.displayName || ""));
    }

    const members = rawMembers
      .map((m) => {
        const displayName = displayNameMap.get(m.uid) || "";
        return {
          uid: m.uid,
          email: m.email,
          role: m.role,
          displayName,
          label: displayName.trim() || m.email || m.uid,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pl"));

    return NextResponse.json({ members }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}