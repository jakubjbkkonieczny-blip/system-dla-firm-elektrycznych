import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";

type Role = "worker" | "employer";

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;

    const body = (await req.json().catch(() => ({}))) as { desiredRole?: Role };
    const desiredRole = body.desiredRole;

    if (desiredRole !== "worker" && desiredRole !== "employer") {
      return NextResponse.json({ error: "ROLE_REQUIRED" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: userId } });
      if (!u) throw new Error("USER_NOT_FOUND");

      if (u.accountRole) {
        if (u.accountRole !== desiredRole) {
          throw new Error("ROLE_MISMATCH");
        }
        return { role: u.accountRole as Role };
      }

      await tx.user.update({
        where: { id: userId },
        data: { accountRole: desiredRole },
      });

      return { role: desiredRole };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "ROLE_MISMATCH") return 409;
      if (msg === "USER_NOT_FOUND") return 404;
      return null;
    });
  }
}
