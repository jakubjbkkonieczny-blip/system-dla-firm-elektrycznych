import "server-only";

import { normalizeOriginalFilename } from "@/lib/server/jobs/photo-upload-policy";
import { isPhotoObjectKey } from "@/lib/server/storage/photo-object-key";

export type PhotoUploadPresignBody = {
  jobStageId: string | null;
  originalFilename: string | null;
};

export type PhotoUploadFinalizeBody = PhotoUploadPresignBody & {
  uploadIntent: string;
  objectKey: string;
};

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("INVALID_PHOTO_UPLOAD");
  }
  return body as Record<string, unknown>;
}

function readJobStageId(record: Record<string, unknown>): string | null {
  if (!Object.prototype.hasOwnProperty.call(record, "jobStageId") || record.jobStageId === null) {
    return null;
  }
  const value = record.jobStageId;
  if (typeof value !== "string") throw new Error("INVALID_PHOTO_UPLOAD");
  const id = value.trim();
  if (!id || id.length > 128 || /[\u0000-\u001f\u007f/\\]/.test(id)) {
    throw new Error("INVALID_PHOTO_UPLOAD");
  }
  return id;
}

function readOriginalFilename(record: Record<string, unknown>): string | null {
  if (
    !Object.prototype.hasOwnProperty.call(record, "originalFilename") ||
    record.originalFilename === null
  ) {
    return null;
  }
  if (typeof record.originalFilename !== "string") throw new Error("INVALID_PHOTO_UPLOAD");
  return normalizeOriginalFilename(record.originalFilename);
}

export async function readPhotoUploadJson(req: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new Error("INVALID_PHOTO_UPLOAD");
  }
}

export function parsePhotoUploadPresignBody(body: unknown): PhotoUploadPresignBody {
  const record = asRecord(body);
  return {
    jobStageId: readJobStageId(record),
    originalFilename: readOriginalFilename(record),
  };
}

export function parsePhotoUploadFinalizeBody(body: unknown): PhotoUploadFinalizeBody {
  const record = asRecord(body);
  const uploadIntent = record.uploadIntent;
  if (typeof uploadIntent !== "string" || uploadIntent.length < 20 || uploadIntent.length > 4096) {
    throw new Error("INVALID_PHOTO_UPLOAD");
  }
  if (/[\u0000-\u001f\u007f\s]/.test(uploadIntent)) throw new Error("INVALID_PHOTO_UPLOAD");

  const objectKey = record.objectKey;
  if (typeof objectKey !== "string" || !isPhotoObjectKey(objectKey)) {
    throw new Error("INVALID_PHOTO_UPLOAD");
  }

  return {
    uploadIntent,
    objectKey,
    jobStageId: readJobStageId(record),
    originalFilename: readOriginalFilename(record),
  };
}
