import { NextResponse } from "next/server";

import { getDeactivatedAccountStateFromAccess } from "@/lib/server/deactivation/get-deactivated-account-state";

export async function GET() {
  const state = await getDeactivatedAccountStateFromAccess();
  if (!state) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, account: state }, { status: 200 });
}
