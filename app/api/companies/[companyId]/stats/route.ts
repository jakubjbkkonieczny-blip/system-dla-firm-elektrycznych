import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string }> };

function yyyymm(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId } = await params;

    // membership check
    await requireActiveMember(companyId, uid);

    const companyRef = adminDb.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const company = companySnap.data() as any;

    // Jobs count by status (prosto i tanio na MVP: 5 zapytań count)
    const jobsRef = companyRef.collection("jobs");
    const [newC, schC, progC, doneC, cancC] = await Promise.all([
      jobsRef.where("status", "==", "new").count().get(),
      jobsRef.where("status", "==", "scheduled").count().get(),
      jobsRef.where("status", "==", "in_progress").count().get(),
      jobsRef.where("status", "==", "done").count().get(),
      jobsRef.where("status", "==", "cancelled").count().get(),
    ]);

    // Usage this month
    const usageRef = companyRef.collection("usage").doc(yyyymm());
    const usageSnap = await usageRef.get();
    const jobsUsed = usageSnap.exists ? Number((usageSnap.data() as any)?.jobsCount || 0) : 0;
    const jobsLimit = Number(company?.limits?.jobsPerMonth || 0) || 0;

    return NextResponse.json(
      {
        ok: true,
        stats: {
          jobs: {
            new: newC.data().count,
            scheduled: schC.data().count,
            in_progress: progC.data().count,
            done: doneC.data().count,
            cancelled: cancC.data().count,
          },
          members: {
            active: Number(company?.activeMembersCount || 0),
            total: Number(company?.membersCount || 0),
          },
          usage: { jobsUsed, jobsLimit },
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}