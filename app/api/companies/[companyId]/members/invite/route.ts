import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Body = {
  email: string;
  role?: "owner" | "admin" | "staff";
  scope?: "all" | "assigned";
};

type Ctx = { params: Promise<{ companyId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, uid);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const email = (body.email || "").trim().toLowerCase();
    const role = body.role === "owner" || body.role === "admin" ? body.role : "staff";
    const scope = body.scope === "assigned" ? "assigned" : "all";

    if (!email) return NextResponse.json({ error: "MISSING_EMAIL" }, { status: 400 });

    // user musi istnieć w Firebase Auth
    const user = await adminAuth.getUserByEmail(email);

    const companyRef = adminDb.collection("companies").doc(companyId);
    const memberRef = companyRef.collection("members").doc(user.uid);
    const userIndexRef = adminDb.collection("user_index").doc(user.uid);

    await adminDb.runTransaction(async (tx) => {
      const mSnap = await tx.get(memberRef);
      const now = FieldValue.serverTimestamp();

      if (!mSnap.exists) {
        // nowy member
        tx.set(memberRef, {
          uid: user.uid,
          email: user.email || email,
          role,
          scope,
          active: true,
          createdAt: now,
          createdBy: uid,
          updatedAt: now,
          updatedBy: uid,
        });

        // ✅ dopisz firmę do user_index pracownika (UX dashboard)
        tx.set(
          userIndexRef,
          {
            companyIds: FieldValue.arrayUnion(companyId),
            updatedAt: now,
          },
          { merge: true }
        );

        // liczniki firmy
        tx.set(
          companyRef,
          {
            membersCount: FieldValue.increment(1),
            activeMembersCount: FieldValue.increment(1),
            updatedAt: now,
          },
          { merge: true }
        );
      } else {
        const prev = mSnap.data() as any;
        const wasActive = prev?.active === true;

        tx.set(
          memberRef,
          {
            email: user.email || email,
            role,
            scope,
            active: true,
            updatedAt: now,
            updatedBy: uid,
          },
          { merge: true }
        );

        // ✅ upewnij się, że jest w user_index (na wypadek starych danych)
        tx.set(
          userIndexRef,
          {
            companyIds: FieldValue.arrayUnion(companyId),
            updatedAt: now,
          },
          { merge: true }
        );

        // jeśli był nieaktywny i aktywujemy -> activeMembersCount +1
        if (!wasActive) {
          tx.set(
            companyRef,
            {
              activeMembersCount: FieldValue.increment(1),
              updatedAt: now,
            },
            { merge: true }
          );
        }
      }
    });

    return NextResponse.json({ ok: true, memberUid: user.uid }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH" ? 401 :
      msg === "auth/user-not-found" ? 404 :
      500;
    return NextResponse.json({ error: msg }, { status });
  }
}