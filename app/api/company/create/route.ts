import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { FieldValue } from "firebase-admin/firestore";

type Body = { name: string };

export async function POST(req: NextRequest) {
  try {
    const uid = await requireAuthUid(req);
    const body = (await req.json()) as Body;

    const name = (body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    const companyRef = db.collection("companies").doc();
    const memberRef = companyRef.collection("members").doc(uid);
    const userIndexRef = db.collection("user_index").doc(uid);
    const userRef = db.collection("users").doc(uid);

    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const user = userSnap.exists ? (userSnap.data() as any) : null;

      if (user?.role !== "employer") {
        throw new Error("FORBIDDEN_ROLE");
      }

      if (user?.billing?.status !== "active") {
        throw new Error("SUBSCRIPTION_REQUIRED");
      }

      const userIndexSnap = await tx.get(userIndexRef);
      const userIndex = userIndexSnap.exists ? (userIndexSnap.data() as any) : null;

      const canCreateCompany = userIndexSnap.exists
        ? Boolean(userIndex?.canCreateCompany ?? true)
        : true;

      if (!canCreateCompany) {
        throw new Error("FORBIDDEN_CREATE_COMPANY");
      }

      // ✅ Twarda blokada: maksymalnie 1 firma
      const existingCompanyIds = Array.isArray(userIndex?.companyIds) ? userIndex.companyIds : [];
      if (existingCompanyIds.length >= 1) {
        throw new Error("COMPANY_LIMIT_REACHED");
      }

      tx.set(companyRef, {
        name,
        createdAt: now,
        createdBy: uid,
        deletedAt: null,
        limits: { jobsPerMonth: 200 },
        membersCount: 1,
        activeMembersCount: 1,
      });

      tx.set(memberRef, {
        uid,
        role: "owner",
        scope: "all",
        active: true,
        createdAt: now,
      });

      tx.set(
        userIndexRef,
        {
          canCreateCompany: true,
          companyIds: FieldValue.arrayUnion(companyRef.id),
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        userRef,
        {
          billing: {
            status: "active",
            activeCompaniesCount: 1,
            unitAmountPln: 400,
          },
        },
        { merge: true }
      );
    });

    return NextResponse.json({ companyId: companyRef.id }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";

    const status =
      msg === "MISSING_AUTH"
        ? 401
        : msg === "FORBIDDEN_ROLE"
        ? 403
        : msg === "SUBSCRIPTION_REQUIRED"
        ? 402
        : msg === "FORBIDDEN_CREATE_COMPANY"
        ? 403
        : msg === "COMPANY_LIMIT_REACHED"
        ? 403
        : 500;

    return NextResponse.json({ error: msg }, { status });
  }
}