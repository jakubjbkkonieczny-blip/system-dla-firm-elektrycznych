import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { randomApiKey, sha256 } from "@/app/api/_lib/crypto";

type Ctx = { params: Promise<{ companyId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;

    const member = await requireActiveMember(companyId, userId);
    if (!["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const apiKey = randomApiKey();
    const apiKeyHash = sha256(apiKey);

    await prisma.company.update({
      where: { id: companyId },
      data: { apiKeyHash },
    });

    return NextResponse.json({ apiKey }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
