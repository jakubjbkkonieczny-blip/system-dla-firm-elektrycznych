import { NextRequest, NextResponse } from "next/server";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { db } from "@/lib/firebase/admin";
import { getMeData } from "@/lib/server/me/get-me";

function getDeleteAtIso() {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString();
}

export async function GET(_req: NextRequest) {
  try {
    const data = await getMeData();
    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = await requireAuthUid(req);

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const user = userSnap.exists ? (userSnap.data() as any) : null;

    if (!user) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const deleteAtIso = getDeleteAtIso();

    // PRACODAWCA: oznacz firmę do usunięcia i odetnij pracowników od firmy
    if (user.role === "employer") {
      const companiesSnap = await db
        .collection("companies")
        .where("ownerUid", "==", uid)
        .get();

      for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;
        const companyRef = db.collection("companies").doc(companyId);

        await companyRef.set(
          {
            deletion: {
              scheduled: true,
              scheduledAt: nowIso,
              deleteAt: deleteAtIso,
              scheduledBy: uid,
            },
            active: false,
            status: "scheduled_for_deletion",
            updatedAt: nowIso,
          },
          { merge: true }
        );

        const membersSnap = await companyRef.collection("members").get();

        for (const memberDoc of membersSnap.docs) {
          const memberUid = memberDoc.id;

          await memberDoc.ref.set(
            {
              active: false,
              removedAt: nowIso,
              removedBy: uid,
            },
            { merge: true }
          );

          await db
            .collection("user_index")
            .doc(memberUid)
            .set(
              {
                companyIds: [],
                updatedAt: nowIso,
              },
              { merge: true }
            );
        }
      }
    }

    // PRACOWNIK: tylko oznacz konto do usunięcia
    // PRACODAWCA: też oznacz konto do usunięcia
    // UWAGA: NIE ruszamy displayName / role / billing
    await userRef.set(
      {
        deletion: {
          scheduled: true,
          scheduledAt: nowIso,
          deleteAt: deleteAtIso,
        },
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "DELETE_ERROR";
    const status =
      msg === "MISSING_AUTH"
        ? 401
        : msg === "USER_NOT_FOUND"
        ? 404
        : 500;

    return NextResponse.json({ error: msg }, { status });
  }
}