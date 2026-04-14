import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import crypto from "crypto";

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key") || "";
    const companyId = req.headers.get("x-company-id") || "";

    if (!apiKey || !companyId) {
      return NextResponse.json({ error: "MISSING_API_KEY_OR_COMPANY" }, { status: 400 });
    }

    // sprawdź hash
    const ref = adminDb.collection("companies").doc(companyId).collection("private").doc("apikey");
    const snap = await ref.get();
    const storedHash = snap.exists ? (snap.data() as any)?.apiKeyHash : null;

    if (!storedHash || sha256(apiKey) !== storedHash) {
      return NextResponse.json({ error: "INVALID_API_KEY" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // MVP: zapis do kolekcji intake_requests (żebyś mógł potem przerobić na tworzenie zleceń)
    const doc = await adminDb.collection("companies").doc(companyId).collection("intake_requests").add({
      ...body,
      createdAt: Date.now(),
      source: "public_intake",
    });

    return NextResponse.json({ ok: true, id: doc.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "UNKNOWN" }, { status: 500 });
  }
}