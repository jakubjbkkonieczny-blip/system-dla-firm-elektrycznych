import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "@/lib/firebase/admin";

type CreateStageBody = {
  nazwa_etapu: string;
  opis_etapu?: string;
  planowana_data?: string; // "YYYY-MM-DD" lub ""
};

function isYyyyMmDd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string }> }
) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId } = await params;

    await requireActiveMember(companyId, uid);

    const ref = adminDb
      .collection("companies")
      .doc(companyId)
      .collection("jobs")
      .doc(jobId)
      .collection("etapy_realizacji");

    // sort: planowana_data asc, createdAt asc (to może wymagać indeksu — już Ci wyskoczył)
    const snap = await ref.orderBy("planowana_data", "asc").orderBy("createdAt", "asc").get();

    const stages = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return NextResponse.json({ stages }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string }> }
) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId } = await params;

    const member = await requireActiveMember(companyId, uid);
    const role = (member?.role || "staff") as "owner" | "admin" | "staff";
    if (!(role === "owner" || role === "admin")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as CreateStageBody;

    const nazwa_etapu = (body.nazwa_etapu || "").trim();
    const opis_etapu = (body.opis_etapu || "").trim();
    const planowana_data_raw = (body.planowana_data || "").trim();
    const planowana_data = planowana_data_raw ? planowana_data_raw : "";

    if (!nazwa_etapu) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }
    if (planowana_data && !isYyyyMmDd(planowana_data)) {
      return NextResponse.json({ error: "BAD_DATE_FORMAT" }, { status: 400 });
    }

    const now = FieldValue.serverTimestamp();
    const stageRef = adminDb
      .collection("companies")
      .doc(companyId)
      .collection("jobs")
      .doc(jobId)
      .collection("etapy_realizacji")
      .doc();

    await stageRef.set({
      nazwa_etapu,
      opis_etapu,
      planowana_data, // string YYYY-MM-DD albo ""
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

    return NextResponse.json({ stageId: stageRef.id }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}