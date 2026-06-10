import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { syncSubscriptionForCompany } from "@/app/api/_lib/billing";
import { syncWorkerOrphanState } from "@/lib/server/workers/worker-lifecycle";

type Body = {
  email: string;
};

type Ctx = { params: Promise<{ companyId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const actorId = sessionUser.id;
    const { companyId } = await params;

    const me = await requireActiveMember(companyId, actorId);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const email = (body.email || "").trim().toLowerCase();

    if (!email) return NextResponse.json({ error: "MISSING_EMAIL" }, { status: 400 });

    const invited = await prisma.user.findUnique({ where: { email } });
    if (!invited) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const role = "staff";
    const scope = "assigned_only";

    const existing = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId: invited.id } },
    });

    if (!existing) {
      await prisma.companyMember.create({
        data: {
          companyId,
          userId: invited.id,
          role,
          scope,
          isActive: true,
          invitedById: actorId,
        },
      });
    } else {
      if (existing.role === "owner") {
        return NextResponse.json({ error: "CANNOT_MODIFY_OWNER" }, { status: 400 });
      }
      await prisma.companyMember.update({
        where: { companyId_userId: { companyId, userId: invited.id } },
        data: {
          role: "staff",
          scope,
          isActive: true,
          invitedById: actorId,
        },
      });
    }

    await syncWorkerOrphanState(invited.id);

    void syncSubscriptionForCompany(companyId).catch((err) =>
      console.error("syncSubscriptionForCompany", err)
    );

    return NextResponse.json({ ok: true, memberUid: invited.id }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, companyRouteErrorStatus);
  }
}
