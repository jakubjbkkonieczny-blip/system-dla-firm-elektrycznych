import { NextRequest, NextResponse } from "next/server";
import { getMyCompanies } from "@/lib/server/me/get-my-companies";

export async function GET(_req: NextRequest) {
  try {
    const companies = await getMyCompanies();
    return NextResponse.json({ companies }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "UNKNOWN";
    const status = msg === "MISSING_AUTH" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}