import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, userId);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const rows = await prisma.companyMember.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { email: true, displayName: true } },
      },
    });

    const members = rows.map((m) => ({
      uid: m.userId,
      email: m.user.email,
      displayName: m.user.displayName || "",
      role: m.role || "staff",
      scope: m.scope || "all",
      active: m.isActive === true,
      createdAt: m.createdAt,
    }));

    return NextResponse.json({ members }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
