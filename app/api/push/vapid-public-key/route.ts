import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/server/push/vapid";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ error: "VAPID_NOT_CONFIGURED" }, { status: 503 });
  }

  return NextResponse.json({ publicKey });
}
