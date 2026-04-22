import { NextRequest, NextResponse } from "next/server";
import { auth, db } from "@/lib/firebase/admin";
import { FieldValue } from "@/lib/firebase/admin";

type Role = "worker" | "employer";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "MISSING_AUTH" }, { status: 401 });

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = (await req.json().catch(() => ({}))) as { desiredRole?: Role };
    const desiredRole = body.desiredRole;

    if (desiredRole !== "worker" && desiredRole !== "employer") {
      return NextResponse.json({ error: "ROLE_REQUIRED" }, { status: 400 });
    }

    const userRef = db.collection("users").doc(uid);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const existingRole = snap.exists ? (snap.data() as any)?.role : null;

      // jeśli rola już jest — nie zmieniamy jej NIGDY
      if (existingRole) {
        if (existingRole !== desiredRole) {
          // twarda blokada: typ UI nie pasuje do roli konta
          throw new Error("ROLE_MISMATCH");
        }
        return { role: existingRole as Role };
      }

      // pierwszy raz: zapisujemy rolę
      tx.set(
        userRef,
        {
          role: desiredRole,
          createdAt: FieldValue.serverTimestamp(),
          billing: {
            status: "inactive",
            activeCompaniesCount: 0,
            unitAmountPln: 400,
          },
        },
        { merge: true }
      );

      return { role: desiredRole };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "ROLE_MISMATCH" ? 409 : msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}