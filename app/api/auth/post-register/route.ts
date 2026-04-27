import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { prisma } from "@/lib/db/prisma";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";

type Role = "worker" | "employer";

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;

    const body = (await req.json()) as {
      role?: Role;
      displayName?: string;
    };

    const role = body?.role;
    const displayName = (body?.displayName || "").trim();

    if (role !== "worker" && role !== "employer") {
      return NextResponse.json({ error: "ROLE_REQUIRED" }, { status: 400 });
    }

    let finalRole: Role | null = null;
    let created = false;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: userId } });
      if (!existing) {
        throw new Error("USER_NOT_FOUND");
      }

      if (existing.accountRole && existing.accountRole !== role) {
        throw new Error("ROLE_MISMATCH");
      }

      if (!existing.accountRole) {
        created = true;
        await tx.user.update({
          where: { id: userId },
          data: {
            accountRole: role,
            ...(displayName ? { displayName } : {}),
          },
        });
        finalRole = role;
      } else {
        finalRole = existing.accountRole as Role;
        if (!existing.displayName && displayName) {
          await tx.user.update({
            where: { id: userId },
            data: { displayName },
          });
        }
      }
    });

    return NextResponse.json({ ok: true, role: finalRole, created }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "ROLE_MISMATCH") return 409;
      if (msg === "USER_NOT_FOUND") return 404;
      return null;
    });
  }
}
