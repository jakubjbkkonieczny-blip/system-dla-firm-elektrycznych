import { NextResponse } from "next/server";

import { clearDeactivatedAccessCookie } from "@/lib/server/deactivation/deactivated-account-access";

export async function POST() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  return clearDeactivatedAccessCookie(res);
}
