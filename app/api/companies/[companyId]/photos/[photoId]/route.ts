import { NextRequest, NextResponse } from "next/server";

import { requireActiveMember } from "@/app/api/_lib/membership";
import { prisma } from "@/lib/db/prisma";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  assertOwnerCanDeleteJobPhoto,
  deleteAuthorizedCompanyPhoto,
} from "@/lib/server/jobs/job-photo-delete";
import { getPhotoStorage } from "@/lib/server/storage/get-photo-storage";

function photoDeleteErrorStatus(message: string): number | null {
  if (message === "PHOTO_NOT_FOUND") return 404;
  if (message === "PHOTO_DELETE_FAILED") return 503;
  if (message === "PHOTO_DELETE_INCOMPLETE") return 500;
  return companyRouteErrorStatus(message);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string; photoId: string }> }
) {
  try {
    const sessionUser = await requireSessionUser();
    const userId = sessionUser.id;
    const { companyId, photoId } = await params;
    const member = await requireActiveMember(companyId, userId);
    assertOwnerCanDeleteJobPhoto(member);

    await deleteAuthorizedCompanyPhoto({
      companyId,
      photoId,
      member,
      findPhoto: (query) =>
        prisma.jobPhoto.findFirst({
          where: { id: query.id, companyId: query.companyId },
          select: { id: true, objectKey: true },
        }),
      deleteBlob: (objectKey) => getPhotoStorage().delete(objectKey),
      deletePhotoRow: (query) =>
        prisma.jobPhoto.deleteMany({
          where: { id: query.id, companyId: query.companyId },
        }),
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, photoDeleteErrorStatus);
  }
}
