import { NextRequest, NextResponse } from "next/server";

import { cleanupPendingWorkers } from "@/lib/server/workers/worker-lifecycle";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.WORKER_CLEANUP_CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = req.headers.get("authorization")?.trim();
  if (!auth?.startsWith("Bearer ")) {
    return false;
  }

  return auth.slice("Bearer ".length) === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await cleanupPendingWorkers();
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
