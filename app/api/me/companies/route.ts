import { NextRequest, NextResponse } from "next/server";
import { getMyCompanies } from "@/lib/server/me/get-my-companies";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

export async function GET(_req: NextRequest) {
  try {
    const companies = await getMyCompanies();
    return NextResponse.json({ companies }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
