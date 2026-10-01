import { NextRequest, NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import { createJobPhotoUploadUrl, photoUploadRouteErrorStatus } from "@/lib/server/jobs/photo-upload";
import {
  parsePhotoUploadPresignBody,
  readPhotoUploadJson,
} from "@/lib/server/jobs/photo-upload-request";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

function photoUploadError(error: unknown): NextResponse {
  const response = handleSessionRouteErrorOr(error, photoUploadRouteErrorStatus);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId } = await params;
    const body = parsePhotoUploadPresignBody(await readPhotoUploadJson(req));
    const upload = await createJobPhotoUploadUrl({
      companyId,
      jobId,
      userId: sessionUser.id,
      jobStageId: body.jobStageId,
      originalFilename: body.originalFilename,
    });

    return NextResponse.json(upload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return photoUploadError(error);
  }
}
