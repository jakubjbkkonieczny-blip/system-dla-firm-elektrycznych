import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "@/lib/firebase/admin";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

function isYyyyMmDd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

async function getJob(companyId: string, jobId: string) {
  const ref = adminDb.collection("companies").doc(companyId).collection("jobs").doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("JOB_NOT_FOUND");
  return snap.data() as any;
}

/**
 * GET: lista etapów
 * owner/admin: zawsze
 * staff: tylko jeśli przypisany do zlecenia
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId } = await params;

    const me = await requireActiveMember(companyId, uid);
    const job = await getJob(companyId, jobId);

    const isAdmin = me.role === "owner" || me.role === "admin";
    const isAssignedStaff = job?.assignedTo === uid;

    if (!isAdmin && !isAssignedStaff) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const snap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("jobs")
      .doc(jobId)
      .collection("etapy_realizacji")
      .orderBy("planowana_data", "asc")
      .orderBy("createdAt", "asc")
      .get();

    const stages = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
    return NextResponse.json({ stages }, { status: 200 });
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

/**
 * POST: dodaj etap (owner/admin)
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId } = await params;

    const me = await requireActiveMember(companyId, uid);
    const isAdmin = me.role === "owner" || me.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    await getJob(companyId, jobId);

    const body = (await req.json()) as {
      nazwa_etapu: string;
      opis_etapu?: string;
      planowana_data?: string; // YYYY-MM-DD
    };

    const nazwa_etapu = (body?.nazwa_etapu || "").trim();
    const opis_etapu = (body?.opis_etapu || "").trim();
    const planowana_data = (body?.planowana_data || "").trim();

    if (!nazwa_etapu) return NextResponse.json({ error: "MISSING_STAGE_NAME" }, { status: 400 });
    if (planowana_data && !isYyyyMmDd(planowana_data)) {
      return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
    }

    const ref = adminDb
      .collection("companies")
      .doc(companyId)
      .collection("jobs")
      .doc(jobId)
      .collection("etapy_realizacji")
      .doc();

    const now = FieldValue.serverTimestamp();

    await ref.set({
      nazwa_etapu,
      opis_etapu: opis_etapu || "",
      planowana_data: planowana_data || "",
      status: "do_wykonania",
      data_zakonczenia: null,
      zakonczone_przez: null,
      notatka_pracownika: "",
      lista_zdjec: [],

      createdAt: now,
      createdBy: uid,
      updatedAt: now,
      updatedBy: uid,
    });

    return NextResponse.json({ ok: true, stageId: ref.id }, { status: 200 });
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