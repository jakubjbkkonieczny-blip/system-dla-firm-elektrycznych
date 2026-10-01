import { NextRequest, NextResponse } from "next/server";

import { requireActiveMember } from "@/app/api/_lib/membership";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  clampGalleryLimit,
  parseGalleryIdFilter,
} from "@/lib/server/jobs/job-photo-query";
import { listCompanyGalleryPhotos } from "@/lib/server/jobs/job-photo-read";

function galleryRouteErrorStatus(message: string): number | null {
  if (message === "INVALID_CURSOR" || message === "INVALID_FILTER") return 400;
  if (message === "PHOTO_STORAGE_UNAVAILABLE") return 503;
  return companyRouteErrorStatus(message);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId } = await params;
    const member = await requireActiveMember(companyId, userId);

    const url = new URL(req.url);
    const jobId = parseGalleryIdFilter(url.searchParams.get("jobId"));
    const uploadedByUserId = parseGalleryIdFilter(url.searchParams.get("uploadedByUserId"));
    const limit = clampGalleryLimit(url.searchParams.get("limit"));
    const cursor = url.searchParams.get("cursor");

    const result = await listCompanyGalleryPhotos({
      companyId,
      userId,
      member,
      limit,
      cursor: cursor || null,
      jobId,
      uploadedByUserId,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, galleryRouteErrorStatus);
  }
}
