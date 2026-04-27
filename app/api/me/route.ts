import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { getMeData } from "@/lib/server/me/get-me";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

function getDeleteAtIso() {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString();
}

export async function GET(_req: NextRequest) {
  try {
    const data = await getMeData();
    return NextResponse.json(data, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const deleteAt = new Date(getDeleteAtIso());

    if (user.accountRole === "employer") {
      const owned = await prisma.companyMember.findMany({
        where: { userId, role: "owner", isActive: true },
        select: { companyId: true },
      });

      for (const { companyId } of owned) {
        await prisma.company.update({
          where: { id: companyId },
          data: {
            isActive: false,
            scheduledDeletionAt: deleteAt,
          },
        });

        await prisma.companyMember.updateMany({
          where: { companyId },
          data: { isActive: false },
        });
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
