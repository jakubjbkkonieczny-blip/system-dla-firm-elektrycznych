import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getUserFromSession } from "@/lib/server/auth/getUserFromSession";

export async function GET() {
  const user = await getUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { theme: true },
  });

  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountRole: user.accountRole,
      theme: dbUser?.theme ?? "LIGHT_BUSINESS",
    },
    { status: 200 }
  );
}
