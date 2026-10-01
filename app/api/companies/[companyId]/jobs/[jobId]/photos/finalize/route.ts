import { NextRequest, NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import { finalizeJobPhotoUpload, photoUploadRouteErrorStatus } from "@/lib/server/jobs/photo-upload";
import {
  parsePhotoUploadFinalizeBody,
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
    const body = parsePhotoUploadFinalizeBody(await readPhotoUploadJson(req));
    const result = await finalizeJobPhotoUpload({
      companyId,
      jobId,
      userId: sessionUser.id,
      uploadIntent: body.uploadIntent,
      objectKey: body.objectKey,
      jobStageId: body.jobStageId,
      originalFilename: body.originalFilename,
    });

    return NextResponse.json(
      { photo: result.photo },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error: unknown) {
    return photoUploadError(error);
  }
}
