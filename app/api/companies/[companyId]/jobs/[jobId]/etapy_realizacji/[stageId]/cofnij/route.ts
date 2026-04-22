import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "@/lib/firebase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string; stageId: string }> }
) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId, stageId } = await params;

    const member = await requireActiveMember(companyId, uid);
    const role = (member?.role || "staff") as "owner" | "admin" | "staff";

    const jobRef = adminDb.collection("companies").doc(companyId).collection("jobs").doc(jobId);
    const stageRef = jobRef.collection("etapy_realizacji").doc(stageId);

    const [jobSnap, stageSnap] = await Promise.all([jobRef.get(), stageRef.get()]);
    if (!jobSnap.exists) return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    if (!stageSnap.exists) return NextResponse.json({ error: "STAGE_NOT_FOUND" }, { status: 404 });

    const job = jobSnap.data() as any;
    const assignedTo = job?.assignedTo || null;

    const can =
      role === "owner" ||
      role === "admin" ||
      (role === "staff" && assignedTo && assignedTo === uid);

    if (!can) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const now = FieldValue.serverTimestamp();

    await stageRef.update({
      status: "do_wykonania",
      data_zakonczenia: null,
      zakonczone_przez: null,

      updatedAt: now,
      updatedBy: uid,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}