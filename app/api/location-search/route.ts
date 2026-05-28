import { NextRequest, NextResponse } from "next/server";
import { getUserFromSession } from "@/lib/server/auth/getUserFromSession";
import type { LocationSearchResponse } from "@/lib/location/types";
import {
  locationReverseGeocode,
  locationSearchByQuery,
  normalizeLocationQuery,
} from "@/lib/server/location/search";

export async function GET(req: NextRequest) {
  const user = await getUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const latRaw = url.searchParams.get("lat");
  const lonRaw = url.searchParams.get("lon");

  if (latRaw != null && lonRaw != null) {
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    const hit = await locationReverseGeocode(lat, lon);
    const payload: LocationSearchResponse = {
      suggestions: hit ? [hit] : [],
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=300" },
    });
  }

  const q = url.searchParams.get("q") ?? "";
  if (!normalizeLocationQuery(q)) {
    return NextResponse.json({ suggestions: [] } satisfies LocationSearchResponse, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  const suggestions = await locationSearchByQuery(q);
  return NextResponse.json({ suggestions } satisfies LocationSearchResponse, {
    status: 200,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
