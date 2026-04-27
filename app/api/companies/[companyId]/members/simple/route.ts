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

    await requireActiveMember(companyId, userId);

    const rows = await prisma.companyMember.findMany({
      where: { companyId, isActive: true },
      include: { user: { select: { email: true, displayName: true } } },
    });

    const members = rows
      .map((d) => {
        const displayName = d.user.displayName || "";
        const email = d.user.email;
        return {
          uid: d.userId,
          email,
          role: d.role || "staff",
          displayName,
          label: displayName.trim() || email || d.userId,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pl"));

    return NextResponse.json({ members }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
