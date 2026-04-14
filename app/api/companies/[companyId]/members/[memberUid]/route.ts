import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "firebase-admin/firestore";

type Ctx = { params: Promise<{ companyId: string; memberUid: string }> };

// PATCH -> aktywuj/dezaktywuj (soft)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, memberUid } = await params;

    const me = await requireActiveMember(companyId, uid);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // 🔥 BLOKADA: NIE MOŻESZ ZMIENIĆ SAMEGO SIEBIE
    if (memberUid === uid) {
      return NextResponse.json({ error: "CANNOT_MODIFY_SELF" }, { status: 400 });
    }

    const body = (await req.json()) as { active?: boolean };
    const active = body.active === true;

    const companyRef = adminDb.collection("companies").doc(companyId);
    const memberRef = companyRef.collection("members").doc(memberUid);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(memberRef);
      if (!snap.exists) throw new Error("MEMBER_NOT_FOUND");

      const prev = snap.data() as any;
      const wasActive = prev?.active === true;

      if (wasActive === active) return;

      const now = FieldValue.serverTimestamp();

      tx.set(
        memberRef,
        { active, updatedAt: now, updatedBy: uid },
        { merge: true }
      );

      tx.set(
        companyRef,
        {
          activeMembersCount: FieldValue.increment(active ? 1 : -1),
          updatedAt: now,
        },
        { merge: true }
      );
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH" ? 401 :
      msg === "MEMBER_NOT_FOUND" ? 404 :
      msg === "CANNOT_MODIFY_SELF" ? 400 :
      500;

    return NextResponse.json({ error: msg }, { status });
  }
}

// DELETE -> usuń na stałe (hard delete)
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, memberUid } = await params;

    const me = await requireActiveMember(companyId, uid);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // 🔥 BLOKADA: NIE MOŻESZ USUNĄĆ SAMEGO SIEBIE
    if (memberUid === uid) {
      return NextResponse.json({ error: "CANNOT_DELETE_SELF" }, { status: 400 });
    }

    const companyRef = adminDb.collection("companies").doc(companyId);
    const memberRef = companyRef.collection("members").doc(memberUid);
    const userIndexRef = adminDb.collection("user_index").doc(memberUid);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(memberRef);
      if (!snap.exists) return;

      const prev = snap.data() as any;
      const wasActive = prev?.active === true;
      const now = FieldValue.serverTimestamp();

      tx.delete(memberRef);

      tx.set(
        companyRef,
        {
          membersCount: FieldValue.increment(-1),
          activeMembersCount: FieldValue.increment(wasActive ? -1 : 0),
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        userIndexRef,
        {
          companyIds: FieldValue.arrayRemove(companyId),
          updatedAt: now,
        },
        { merge: true }
      );
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH" ? 401 :
      msg === "CANNOT_DELETE_SELF" ? 400 :
      500;

    return NextResponse.json({ error: msg }, { status });
  }
}