import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { FieldValue } from "firebase-admin/firestore";

type Role = "worker" | "employer";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireAuthUid(req);
    const body = (await req.json()) as {
      role?: Role;
      displayName?: string;
    };

    const role = body?.role;
    const displayName = (body?.displayName || "").trim();

    if (role !== "worker" && role !== "employer") {
      return NextResponse.json({ error: "ROLE_REQUIRED" }, { status: 400 });
    }

    const userRef = db.collection("users").doc(uid);

    let finalRole: Role | null = null;
    let created = false;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const existing = snap.exists ? (snap.data() as any) : null;

      if (existing?.role && existing.role !== role) {
        throw new Error("ROLE_MISMATCH");
      }

      if (!existing?.role) {
        created = true;

        const payload: Record<string, any> = {
          role,
          createdAt: FieldValue.serverTimestamp(),
        };

        if (displayName) payload.displayName = displayName;

        if (role === "employer") {
          payload.billing = {
            status: "inactive",
            activeCompaniesCount: 0,
            unitAmountPln: 400,
          };
        }

        tx.set(userRef, payload, { merge: true });
        finalRole = role;
      } else {
        finalRole = existing.role as Role;

        if (!existing?.displayName && displayName) {
          tx.set(userRef, { displayName }, { merge: true });
        }
      }
    });

    return NextResponse.json({ ok: true, role: finalRole, created }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH"
        ? 401
        : msg === "ROLE_MISMATCH"
        ? 409
        : 500;

    return NextResponse.json({ error: msg }, { status });
  }
}