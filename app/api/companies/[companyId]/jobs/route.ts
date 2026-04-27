import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAuthUid } from "@/app/api/_lib/auth";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { FieldValue } from "@/lib/firebase/admin";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function yyyymm(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

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

type CreateJobBody = {
  customerName: string;
  customerPhone: string;
  addressCity: string;
  addressStreet: string;
  addressZip?: string;
  addressNotes?: string;
  description: string;
  preferredFrom?: string;
  preferredTo?: string;
  priority?: "normal" | "urgent";
  assignedToUids?: string[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId } = await params;

    const member = await requireActiveMember(companyId, uid);

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const todo = url.searchParams.get("todo") === "1";
    const limit = clamp(Number(url.searchParams.get("limit") || "50"), 1, 50);
    const cursor = url.searchParams.get("cursor");

    let q: any = adminDb
      .collection("companies")
      .doc(companyId)
      .collection("jobs")
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (todo) {
      q = q.where("status", "in", ["new", "scheduled", "in_progress"]);
    } else if (status) {
      q = q.where("status", "==", status);
    }

    if (cursor) {
      const cursorSnap = await adminDb
        .collection("companies")
        .doc(companyId)
        .collection("jobs")
        .doc(cursor)
        .get();

      if (cursorSnap.exists) {
        q = q.startAfter(cursorSnap);
      }
    }

    const snap = await q.get();

    const jobs = snap.docs
      .map((d: any) => {
        const data = d.data() as any;

        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null,
          statusUpdatedAt: data.statusUpdatedAt?.toDate?.() || data.statusUpdatedAt || null,
        };
      })
      .filter((job: any) => canMemberSeeJob(member, uid, job))
      .map((job: any) => {
        const assignedToUids = readAssignedToUids(job);
        return {
          ...job,
          assignedToUids,
          assignedTo: assignedToUids[0] || null,
        };
      });

    const nextCursor =
      snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

    return NextResponse.json({ jobs, nextCursor }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const uid = await requireAuthUid(req);
    const { companyId } = await params;

    const member = await requireActiveMember(companyId, uid);
    const role = String(member?.role || "staff");

    if (!(role === "owner" || role === "admin")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as CreateJobBody;

    const customerName = (body.customerName || "").trim();
    const customerPhone = (body.customerPhone || "").trim();
    const addressCity = (body.addressCity || "").trim();
    const addressStreet = (body.addressStreet || "").trim();
    const addressZip = (body.addressZip || "").trim();
    const addressNotes = (body.addressNotes || "").trim();
    const description = (body.description || "").trim();
    const preferredFrom = (body.preferredFrom || "").trim();
    const preferredTo = (body.preferredTo || "").trim();
    const priority = body.priority === "urgent" ? "urgent" : "normal";
    const assignedToUids = normalizeAssignedToUids(body.assignedToUids);

    if (!customerName || !customerPhone || !addressCity || !addressStreet || !description) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    const companyRef = adminDb.collection("companies").doc(companyId);
    const usageRef = companyRef.collection("usage").doc(yyyymm());
    const jobRef = companyRef.collection("jobs").doc();
    const now = FieldValue.serverTimestamp();

    await adminDb.runTransaction(async (tx: any) => {
      const companySnap = await tx.get(companyRef);
      if (!companySnap.exists) throw new Error("COMPANY_NOT_FOUND");

      const limits = (companySnap.data() as any)?.limits || {};
      const monthLimit = Number(limits.jobsPerMonth || 0) || 0;

      const usageSnap = await tx.get(usageRef);
      const current = usageSnap.exists ? Number((usageSnap.data() as any)?.jobsCount || 0) : 0;

      if (monthLimit > 0 && current >= monthLimit) {
        throw new Error("LIMIT_JOBS_PER_MONTH");
      }

      tx.set(jobRef, {
        customerName,
        customerPhone,
        addressCity,
        addressStreet,
        addressZip,
        addressNotes,
        description,
        preferredFrom,
        preferredTo,
        priority,
        status: "new",

        assignedToUids,
        assignedTo: assignedToUids[0] || null,

        createdAt: new Date(),
        statusUpdatedAt: new Date(),
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
      });

      tx.set(
        usageRef,
        {
          yyyymm: yyyymm(),
          jobsCount: FieldValue.increment(1),
          updatedAt: now,
        },
        { merge: true }
      );
    });

    return NextResponse.json({ jobId: jobRef.id }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status =
      msg === "MISSING_AUTH"
        ? 401
        : msg === "LIMIT_JOBS_PER_MONTH"
        ? 403
        : msg === "FORBIDDEN"
        ? 403
        : 500;

    return NextResponse.json({ error: msg }, { status });
  }
}