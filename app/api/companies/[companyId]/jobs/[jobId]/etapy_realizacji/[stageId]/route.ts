import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "firebase-admin/firestore";

function isYyyyMmDd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string; stageId: string }> }
) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId, stageId } = await params;

    const member = await requireActiveMember(companyId, uid);
    const role = (member?.role || "staff") as "owner" | "admin" | "staff";

    const body = (await req.json()) as any;

    const jobRef = adminDb.collection("companies").doc(companyId).collection("jobs").doc(jobId);
    const stageRef = jobRef.collection("etapy_realizacji").doc(stageId);

    const [jobSnap, stageSnap] = await Promise.all([jobRef.get(), stageRef.get()]);
    if (!jobSnap.exists) return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    if (!stageSnap.exists) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    const job = jobSnap.data() as any;
    const assignedTo = job?.assignedTo || null;

    const now = FieldValue.serverTimestamp();

    // owner/admin mogą wszystko edytować w etapie (poza polami systemowymi)
    if (role === "owner" || role === "admin") {
      const patch: any = {};

      if (body.nazwa_etapu !== undefined) patch.nazwa_etapu = String(body.nazwa_etapu || "").trim();
      if (body.opis_etapu !== undefined) patch.opis_etapu = String(body.opis_etapu || "").trim();

      if (body.planowana_data !== undefined) {
        const v = String(body.planowana_data || "").trim();
        if (v && !isYyyyMmDd(v)) return NextResponse.json({ error: "BAD_DATE_FORMAT" }, { status: 400 });
        patch.planowana_data = v;
      }

      if (body.notatka_pracownika !== undefined) patch.notatka_pracownika = String(body.notatka_pracownika || "");
      if (body.lista_zdjec !== undefined) patch.lista_zdjec = Array.isArray(body.lista_zdjec) ? body.lista_zdjec : [];

      patch.updatedAt = now;
      patch.updatedBy = uid;

      await stageRef.update(patch);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // staff: tylko notatka + lista_zdjec i tylko jeśli assignedTo == uid
    if (role === "staff") {
      if (!assignedTo || assignedTo !== uid) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }

      const patch: any = {};
      const allowedKeys = ["notatka_pracownika", "lista_zdjec"];
      const keys = Object.keys(body || {});
      if (keys.some((k) => !allowedKeys.includes(k))) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }

      if (body.notatka_pracownika !== undefined) patch.notatka_pracownika = String(body.notatka_pracownika || "");
      if (body.lista_zdjec !== undefined) patch.lista_zdjec = Array.isArray(body.lista_zdjec) ? body.lista_zdjec : [];

      patch.updatedAt = now;
      patch.updatedBy = uid;

      await stageRef.update(patch);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string; stageId: string }> }
) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId, stageId } = await params;

    const member = await requireActiveMember(companyId, uid);
    const role = (member?.role || "staff") as "owner" | "admin" | "staff";
    if (!(role === "owner" || role === "admin")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const stageRef = adminDb
      .collection("companies")
      .doc(companyId)
      .collection("jobs")
      .doc(jobId)
      .collection("etapy_realizacji")
      .doc(stageId);

    await stageRef.delete();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

