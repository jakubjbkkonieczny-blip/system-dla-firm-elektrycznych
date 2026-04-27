import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { syncSubscriptionForUser } from "@/app/api/_lib/billing";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";

type Body = { name: string };

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const body = (await req.json()) as Body;

    const name = (body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    const companyId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.accountRole !== "employer") {
        throw new Error("FORBIDDEN_ROLE");
      }
      if (!user.stripeSubscriptionId) {
        throw new Error("SUBSCRIPTION_REQUIRED");
      }

      const owned = await tx.companyMember.count({
        where: { userId, role: "owner", isActive: true },
      });
      if (owned >= 1) {
        throw new Error("COMPANY_LIMIT_REACHED");
      }

      const company = await tx.company.create({
        data: {
          name,
          billingStatus: "inactive",
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: company.id,
          userId,
          role: "owner",
          scope: "all",
          isActive: true,
        },
      });

      return company.id;
    });

    void syncSubscriptionForUser(userId).catch((err) =>
      console.error("syncSubscriptionForUser", err)
    );

    return NextResponse.json({ companyId }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN_ROLE" || msg === "COMPANY_LIMIT_REACHED") return 403;
      if (msg === "SUBSCRIPTION_REQUIRED") return 402;
      if (msg === "USER_NOT_FOUND") return 404;
      return null;
    });
  }
}
