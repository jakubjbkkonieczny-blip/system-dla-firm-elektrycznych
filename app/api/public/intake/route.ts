import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

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

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { apiKeyHash: true },
    });

    const storedHash = company?.apiKeyHash ?? null;
    if (!storedHash || sha256(apiKey) !== storedHash) {
      return NextResponse.json({ error: "INVALID_API_KEY" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const row = await prisma.auditLog.create({
      data: {
        companyId,
        userId: null,
        action: "public_intake",
        entityType: "intake_request",
        entityId: crypto.randomUUID(),
        data: body as object,
      },
    });

    return NextResponse.json({ ok: true, id: row.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "UNKNOWN" }, { status: 500 });
  }
}
