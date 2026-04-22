import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "@/lib/firebase/admin";

type Ctx = { params: Promise<{ companyId: string; jobId: string; stageId: string }> };

function isYyyyMmDd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
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
 * PATCH: edycja etapu (owner/admin)
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId, stageId } = await params;

    const me = await requireActiveMember(companyId, uid);
    const isAdmin = me.role === "owner" || me.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const body = (await req.json()) as {
      nazwa_etapu?: string;
      opis_etapu?: string;
      planowana_data?: string;
    };

    const patch: any = {};
    if (typeof body.nazwa_etapu === "string") {
      const v = body.nazwa_etapu.trim();
      if (!v) return NextResponse.json({ error: "MISSING_STAGE_NAME" }, { status: 400 });
      patch.nazwa_etapu = v;
    }
    if (typeof body.opis_etapu === "string") patch.opis_etapu = body.opis_etapu.trim();

    if (typeof body.planowana_data === "string") {
      const d = body.planowana_data.trim();
      if (d && !isYyyyMmDd(d)) return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
      patch.planowana_data = d;
    }

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = uid;

    const ref = refStage(companyId, jobId, stageId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    await ref.set(patch, { merge: true });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH"
        ? 401
        : msg === "NOT_A_MEMBER" || msg === "MEMBER_INACTIVE"
        ? 403
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * DELETE: usuń etap (owner/admin)
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId, stageId } = await params;

    const me = await requireActiveMember(companyId, uid);
    const isAdmin = me.role === "owner" || me.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const ref = refStage(companyId, jobId, stageId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    await ref.delete();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH"
        ? 401
        : msg === "NOT_A_MEMBER" || msg === "MEMBER_INACTIVE"
        ? 403
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}