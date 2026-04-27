import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, userId);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const [activeMembersCount, membersCount] = await Promise.all([
      prisma.companyMember.count({ where: { companyId, isActive: true } }),
      prisma.companyMember.count({ where: { companyId } }),
    ]);

    return NextResponse.json(
      {
        role: me.role,
        scope: me.scope,
        activeMembersCount,
        membersCount,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
