import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { auth, FieldValue } from "@/lib/firebase/admin";

// ================= PATCH =================
export async function PATCH(req: NextRequest) {
  try {
    const uid = await requireAuthUid(req);
    const body = (await req.json()) as { displayName?: string };

    const displayName = String(body?.displayName || "").trim();

    if (!displayName) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    await db.collection("users").doc(uid).set(
      {
        displayName,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, displayName }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// ================= HELPER =================
async function deleteCollection(path: string) {
  const snapshot = await db.collection(path).get();
  if (snapshot.empty) return;

  const batch = db.batch();

  snapshot.docs.forEach((doc: any) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

// ================= DELETE =================
export async function DELETE(req: NextRequest) {
  try {
    const uid = await requireAuthUid(req);

    // 1. user
    await db.collection("users").doc(uid).delete();
    await db.collection("user_index").doc(uid).delete();

    // 2. subkolekcje
    await deleteCollection(`users/${uid}/memberships`);
    await deleteCollection(`users/${uid}/applications`);

    // 3. jobs
    const jobsSnap = await db
      .collection("jobs")
      .where("ownerId", "==", uid)
      .get();

    for (const doc of jobsSnap.docs) {
      await doc.ref.delete();
    }

    // 4. companies
    const companiesSnap = await db
      .collection("companies")
      .where("ownerId", "==", uid)
      .get();

    for (const doc of companiesSnap.docs) {
      await doc.ref.delete();
    }

    // 5. auth
    await auth().deleteUser(uid);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "DELETE_FAILED";
    const status = msg === "MISSING_AUTH" ? 401 : 500;

    return NextResponse.json({ error: msg }, { status });
  }
}