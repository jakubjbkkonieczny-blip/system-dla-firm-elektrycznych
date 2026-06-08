import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import { isDevBillingBypassEnabled } from "@/lib/server/dev/is-dev-billing-bypass-enabled";

export async function POST() {
  if (!isDevBillingBypassEnabled()) {
    return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  }

  try {
    const sessionUser = await requireSessionUser();

    if (sessionUser.accountRole !== "employer") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const subscriptionEndsAt = new Date();
    subscriptionEndsAt.setDate(subscriptionEndsAt.getDate() + 30);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: sessionUser.id },
        data: {
          subscriptionStatus: "active",
          subscriptionEndsAt,
          subscriptionCancelAtPeriodEnd: false,
        },
      });

      const owned = await tx.companyMember.findMany({
        where: { userId: sessionUser.id, role: "owner", isActive: true },
        select: { companyId: true },
      });

      if (owned.length > 0) {
        await tx.company.updateMany({
          where: { id: { in: owned.map((row) => row.companyId) } },
          data: { billingStatus: "active" },
        });
      }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN") return 403;
      if (msg === "USER_NOT_FOUND") return 404;
      return null;
    });
  }
}
