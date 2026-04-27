import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, userId);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();

    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    await prisma.company.update({
      where: { id: companyId },
      data: { name },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
