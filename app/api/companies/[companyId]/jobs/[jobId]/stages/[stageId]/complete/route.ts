import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "firebase-admin/firestore";

type Ctx = { params: Promise<{ companyId: string; jobId: string; stageId: string }> };

function todayYyyyMmDd() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC) – prosto i stabilnie
}

async function getJob(companyId: string, jobId: string) {
  const ref = adminDb.collection("companies").doc(companyId).collection("jobs").doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("JOB_NOT_FOUND");
  return snap.data() as any;
}

function refStage(companyId: string, jobId: string, stageId: string) {
  return adminDb
    .collection("companies")
    .doc(companyId)
    .collection("jobs")
    .doc(jobId)
    .collection("etapy_realizacji")
    .doc(stageId);
}

/**
 * POST: oznacz etap jako zakończony
 * owner/admin: zawsze
 * staff: tylko jeśli assignedTo == uid
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId, stageId } = await params;

    const me = await requireActiveMember(companyId, uid);
    const job = await getJob(companyId, jobId);

    const isAdmin = me.role === "owner" || me.role === "admin";
    const isAssignedStaff = job?.assignedTo === uid;

    if (!isAdmin && !isAssignedStaff) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as {
      notatka_pracownika?: string;
      lista_zdjec?: string[]; // URL-e już po uploadzie
    };

    const notatka_pracownika = (body?.notatka_pracownika || "").trim();
    const lista_zdjec = Array.isArray(body?.lista_zdjec) ? body.lista_zdjec.filter(Boolean) : [];

    const ref = refStage(companyId, jobId, stageId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    const now = FieldValue.serverTimestamp();
    const data_zakonczenia = todayYyyyMmDd();

    await ref.set(
      {
        status: "zakonczony",
        data_zakonczenia,
        zakonczone_przez: uid,
        notatka_pracownika,
        lista_zdjec,
        updatedAt: now,
        updatedBy: uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH"
        ? 401
        : msg === "JOB_NOT_FOUND"
        ? 404
        : msg === "NOT_A_MEMBER" || msg === "MEMBER_INACTIVE"
        ? 403
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}