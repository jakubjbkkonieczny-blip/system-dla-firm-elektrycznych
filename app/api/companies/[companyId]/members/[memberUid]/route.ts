import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireActiveMember } from "@/app/api/_lib/membership";

type Ctx = { params: Promise<{ companyId: string; memberUid: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const actorId = sessionUser.id;
    const { companyId, memberUid } = await params;

    const me = await requireActiveMember(companyId, actorId);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (memberUid === actorId) {
      return NextResponse.json({ error: "CANNOT_MODIFY_SELF" }, { status: 400 });
    }

    const body = (await req.json()) as { active?: boolean };
    const active = body.active === true;

    const member = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId: memberUid } },
    });
    if (!member) throw new Error("MEMBER_NOT_FOUND");

    if (member.isActive === active) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    await prisma.companyMember.update({
      where: { companyId_userId: { companyId, userId: memberUid } },
      data: { isActive: active },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      const s = companyRouteErrorStatus(msg);
      if (s !== null) return s;
      if (msg === "CANNOT_MODIFY_SELF") return 400;
      return null;
    });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const actorId = sessionUser.id;
    const { companyId, memberUid } = await params;

    const me = await requireActiveMember(companyId, actorId);
    if (me.role !== "owner" && me.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (memberUid === actorId) {
      return NextResponse.json({ error: "CANNOT_DELETE_SELF" }, { status: 400 });
    }

    await prisma.companyMember.delete({
      where: { companyId_userId: { companyId, userId: memberUid } },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      const s = companyRouteErrorStatus(msg);
      if (s !== null) return s;
      if (msg === "CANNOT_DELETE_SELF") return 400;
      return null;
    });
  }
}
