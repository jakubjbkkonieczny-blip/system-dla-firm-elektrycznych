import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "firebase-admin/firestore";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

function normalizeAssignedToUids(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = input
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  return Array.from(new Set(out));
}

function readAssignedToUids(job: any): string[] {
  const fromArray = normalizeAssignedToUids(job?.assignedToUids);
  if (fromArray.length > 0) return fromArray;

  const legacy = String(job?.assignedTo || "").trim();
  return legacy ? [legacy] : [];
}

function canMemberSeeJob(member: any, uid: string, job: any) {
  const role = String(member?.role || "staff");
  const scope = String(member?.scope || "all");

  if (role === "owner" || role === "admin") return true;

  const assigned = readAssignedToUids(job);
  return assigned.includes(uid) || scope === "all";
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId } = await params;

    const member = await requireActiveMember(companyId, uid);

    if (!jobId) {
      return NextResponse.json({ error: "MISSING_JOB_ID" }, { status: 400 });
    }

    const ref = adminDb.collection("companies").doc(companyId).collection("jobs").doc(jobId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const job = { id: snap.id, ...(snap.data() as any) };
    const assignedToUids = readAssignedToUids(job);

    if (!canMemberSeeJob(member, uid, job)) {
      return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(
      {
        job: {
          ...job,
          assignedToUids,
          assignedTo: assignedToUids[0] || null,
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

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId, jobId } = await params;

    const member = await requireActiveMember(companyId, uid);
    const role = String(member?.role || "staff");

    if (!jobId) {
      return NextResponse.json({ error: "MISSING_JOB_ID" }, { status: 400 });
    }

    const body = (await req.json()) as any;
    const patch: any = {};

    if (typeof body.status === "string") {
      patch.status = body.status;
      patch.statusUpdatedAt = new Date();
    }

    if (body.assignedToUids !== undefined) {
      if (!(role === "owner" || role === "admin")) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }

      const assignedToUids = normalizeAssignedToUids(body.assignedToUids);
      patch.assignedToUids = assignedToUids;
      patch.assignedTo = assignedToUids[0] || null;
    }

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = uid;

    const ref = adminDb.collection("companies").doc(companyId).collection("jobs").doc(jobId);
    await ref.set(patch, { merge: true });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH" ? 401 : msg === "FORBIDDEN" ? 403 : 500;

    return NextResponse.json({ error: msg }, { status });
  }
}