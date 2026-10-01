import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  companyRouteErrorStatus,
  type SessionRouteErrorMap,
} from "@/lib/server/auth/handle-session-route-error";
import { isUserAssignedToJob } from "@/lib/server/jobs/job-assignments";
import { requireJobPhotoAccessForUser } from "@/lib/server/jobs/job-photo-access";
import { requireCompanyJobStage } from "@/lib/server/jobs/job-stage-ownership";
import {
  createPhotoUploadIntent,
  photoUploadIntentBinding,
  verifyPhotoUploadIntent,
  type PhotoUploadIntentClaims,
} from "@/lib/server/jobs/photo-upload-intent";
import {
  canUploadJobPhoto,
  PHOTO_JPEG_CONTENT_TYPE,
  PHOTO_MAX_SIZE_BYTES,
  PHOTO_UPLOAD_URL_TTL_SECONDS,
  storedPhotoRejection,
} from "@/lib/server/jobs/photo-upload-policy";
import { PhotoObjectKeyError, createPhotoObjectKey } from "@/lib/server/storage/photo-object-key";
import { getPhotoStorage } from "@/lib/server/storage/get-photo-storage";
import type { PhotoObjectHead, PhotoUploadUrl } from "@/lib/server/storage/photo-storage";

/**
 * Two-phase private photo upload.
 *
 * Presign authorizes the member, mints an unguessable objectKey, signs an
 * upload intent, and returns a short-lived JPEG PUT URL.
 * Finalize trusts the signed intent, re-authorizes, then reads storage
 * metadata before inserting JobPhoto. Browser type and size are ignored.
 */

const photoSelect = {
  id: true,
  companyId: true,
  jobId: true,
  jobStageId: true,
  uploadedByUserId: true,
  objectKey: true,
  originalFilename: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

export type JobPhotoUploadRecord = {
  id: string;
  companyId: string;
  jobId: string;
  jobStageId: string | null;
  uploadedByUserId: string;
  objectKey: string;
  originalFilename: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export type JobPhotoUploadUrlResult = {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  uploadIntent: string;
  jobStageId: string | null;
  originalFilename: string | null;
  contentType: typeof PHOTO_JPEG_CONTENT_TYPE;
  maximumSizeBytes: number;
};

type PhotoRow = {
  id: string;
  companyId: string;
  jobId: string;
  jobStageId: string | null;
  uploadedByUserId: string;
  objectKey: string;
  originalFilename: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
};

export const photoUploadRouteErrorStatus: SessionRouteErrorMap = (message) => {
  const shared = companyRouteErrorStatus(message);
  if (shared !== null) return shared;
  switch (message) {
    case "INVALID_PHOTO_UPLOAD":
    case "UPLOAD_INTENT_INVALID":
    case "PHOTO_NOT_UPLOADED":
    case "PHOTO_CONTENT_TYPE":
    case "PHOTO_EMPTY":
    case "PHOTO_TOO_LARGE":
      return 400;
    case "PHOTO_ALREADY_RECORDED":
      return 409;
    case "PHOTO_STORAGE_UNAVAILABLE":
      return 503;
    case "INTERNAL_ERROR":
      return 500;
    default:
      return null;
  }
};

function toPhotoRecord(photo: PhotoRow): JobPhotoUploadRecord {
  return {
    id: photo.id,
    companyId: photo.companyId,
    jobId: photo.jobId,
    jobStageId: photo.jobStageId,
    uploadedByUserId: photo.uploadedByUserId,
    objectKey: photo.objectKey,
    originalFilename: photo.originalFilename,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    createdAt: photo.createdAt.toISOString(),
  };
}

function photoRowMatchesIntent(photo: PhotoRow, claims: PhotoUploadIntentClaims): boolean {
  return (
    photo.companyId === claims.companyId &&
    photo.jobId === claims.jobId &&
    photo.jobStageId === claims.jobStageId &&
    photo.uploadedByUserId === claims.userId &&
    photo.objectKey === claims.objectKey &&
    photo.originalFilename === claims.originalFilename
  );
}

async function assertCurrentUserMayUpload(input: {
  companyId: string;
  jobId: string;
  userId: string;
  role: string;
  jobStageId: string | null;
}): Promise<void> {
  let isStageSupervisor = false;

  if (input.jobStageId) {
    await requireCompanyJobStage(input.companyId, input.jobId, input.jobStageId);
    const stage = await prisma.jobStage.findFirst({
      where: { id: input.jobStageId, companyId: input.companyId, jobId: input.jobId },
      select: { supervisorUserId: true },
    });
    if (!stage) throw new Error("STAGE_NOT_FOUND");
    isStageSupervisor = stage.supervisorUserId === input.userId;
  }

  const isAssignedToJob =
    input.role === "staff" && input.jobStageId !== null
      ? await isUserAssignedToJob(input.jobId, input.userId, input.companyId)
      : false;

  if (
    !canUploadJobPhoto({
      role: input.role,
      jobStageId: input.jobStageId,
      isStageSupervisor,
      isAssignedToJob,
    })
  ) {
    throw new Error("FORBIDDEN");
  }
}

async function deleteRejectedObject(objectKey: string, companyId: string, jobId: string): Promise<void> {
  try {
    await getPhotoStorage().delete(objectKey);
  } catch {
    console.error("rejected photo object cleanup failed", { companyId, jobId });
  }
}

export async function createJobPhotoUploadUrl(input: {
  companyId: string;
  jobId: string;
  userId: string;
  jobStageId: string | null;
  originalFilename: string | null;
}): Promise<JobPhotoUploadUrlResult> {
  // Membership (requireActiveMember) and job visibility (assertMemberCanAccessJob).
  const access = await requireJobPhotoAccessForUser(input.companyId, input.jobId, input.userId);
  await assertCurrentUserMayUpload({
    companyId: input.companyId,
    jobId: input.jobId,
    userId: access.userId,
    role: access.member.role,
    jobStageId: input.jobStageId,
  });

  let objectKey: string;
  try {
    objectKey = createPhotoObjectKey({ companyId: input.companyId, jobId: input.jobId });
  } catch (error) {
    if (error instanceof PhotoObjectKeyError) throw new Error("INVALID_PHOTO_UPLOAD");
    throw error;
  }

  const uploadIntent = createPhotoUploadIntent({
    userId: access.userId,
    companyId: input.companyId,
    jobId: input.jobId,
    jobStageId: input.jobStageId,
    objectKey,
    originalFilename: input.originalFilename,
  });

  let upload: PhotoUploadUrl;
  try {
    upload = await getPhotoStorage().createUploadUrl({
      objectKey,
      contentType: PHOTO_JPEG_CONTENT_TYPE,
      ttlSeconds: PHOTO_UPLOAD_URL_TTL_SECONDS,
      maximumSizeInBytes: PHOTO_MAX_SIZE_BYTES,
    });
  } catch {
    throw new Error("PHOTO_STORAGE_UNAVAILABLE");
  }
  if (upload.objectKey !== objectKey || !upload.uploadUrl) {
    throw new Error("PHOTO_STORAGE_UNAVAILABLE");
  }

  return {
    objectKey,
    uploadUrl: upload.uploadUrl,
    expiresAt: upload.expiresAt.toISOString(),
    uploadIntent,
    jobStageId: input.jobStageId,
    originalFilename: input.originalFilename,
    contentType: PHOTO_JPEG_CONTENT_TYPE,
    maximumSizeBytes: PHOTO_MAX_SIZE_BYTES,
  };
}

export async function finalizeJobPhotoUpload(input: {
  companyId: string;
  jobId: string;
  userId: string;
  uploadIntent: string;
  objectKey: string;
  jobStageId: string | null;
  originalFilename: string | null;
}): Promise<{ photo: JobPhotoUploadRecord; created: boolean }> {
  const claims = verifyPhotoUploadIntent(input.uploadIntent);
  if (!claims) throw new Error("UPLOAD_INTENT_INVALID");

  const binding = photoUploadIntentBinding(claims, {
    userId: input.userId,
    companyId: input.companyId,
    jobId: input.jobId,
    jobStageId: input.jobStageId,
    objectKey: input.objectKey,
    originalFilename: input.originalFilename,
  });
  if (binding === "wrong_user") throw new Error("FORBIDDEN");
  if (binding !== "ok") throw new Error("UPLOAD_INTENT_INVALID");

  // Re-check membership, job visibility, and upload permission against current rows.
  const access = await requireJobPhotoAccessForUser(input.companyId, input.jobId, input.userId);
  await assertCurrentUserMayUpload({
    companyId: input.companyId,
    jobId: input.jobId,
    userId: access.userId,
    role: access.member.role,
    jobStageId: claims.jobStageId,
  });

  const existing = await prisma.jobPhoto.findUnique({
    where: { objectKey: claims.objectKey },
    select: photoSelect,
  });
  if (existing) {
    if (!photoRowMatchesIntent(existing, claims)) throw new Error("PHOTO_ALREADY_RECORDED");
    return { photo: toPhotoRecord(existing), created: false };
  }

  let metadata: PhotoObjectHead | null;
  try {
    metadata = await getPhotoStorage().head(claims.objectKey);
  } catch {
    throw new Error("PHOTO_STORAGE_UNAVAILABLE");
  }
  if (!metadata || metadata.objectKey !== claims.objectKey) {
    if (!metadata) throw new Error("PHOTO_NOT_UPLOADED");
    throw new Error("PHOTO_STORAGE_UNAVAILABLE");
  }

  const rejection = storedPhotoRejection({
    contentType: metadata.contentType,
    sizeBytes: metadata.sizeBytes,
  });
  if (rejection) {
    await deleteRejectedObject(claims.objectKey, claims.companyId, claims.jobId);
    throw new Error(rejection);
  }

  try {
    const created = await prisma.jobPhoto.create({
      data: {
        companyId: claims.companyId,
        jobId: claims.jobId,
        jobStageId: claims.jobStageId,
        uploadedByUserId: claims.userId,
        objectKey: claims.objectKey,
        originalFilename: claims.originalFilename,
        contentType: PHOTO_JPEG_CONTENT_TYPE,
        sizeBytes: metadata.sizeBytes,
      },
      select: photoSelect,
    });
    return { photo: toPhotoRecord(created), created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.jobPhoto.findUnique({
        where: { objectKey: claims.objectKey },
        select: photoSelect,
      });
      if (raced && photoRowMatchesIntent(raced, claims)) {
        return { photo: toPhotoRecord(raced), created: false };
      }
      throw new Error("PHOTO_ALREADY_RECORDED");
    }
    console.error("photo finalize persist failed", {
      companyId: claims.companyId,
      jobId: claims.jobId,
    });
    throw new Error("INTERNAL_ERROR");
  }
}
