import { NextResponse } from "next/server";
import { getUserFromSession } from "@/lib/server/auth/getUserFromSession";

export async function GET() {
  const user = await getUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountRole: user.accountRole,
    },
    { status: 200 }
  );
}
