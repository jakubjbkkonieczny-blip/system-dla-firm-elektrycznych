import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Server-generated photo object keys.
 *
 * Shape: companies/{companyId}/jobs/{jobId}/photos/{random}.jpg
 *
 * jobStageId is intentionally absent. Deleting a stage nulls JobPhoto.jobStageId,
 * and the object must stay addressable. The fixed .jpg suffix is not the
 * original filename and is not a content-type authority. Content type is stored
 * on JobPhoto. The key is not an authorization credential.
 */

const NAMESPACE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const PHOTO_OBJECT_KEY =
  /^companies\/[A-Za-z0-9_-]{1,128}\/jobs\/[A-Za-z0-9_-]{1,128}\/photos\/[a-f0-9]{32}\.jpg$/;

export class PhotoObjectKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoObjectKeyError";
  }
}

function assertNamespaceId(value: string, label: "companyId" | "jobId"): void {
  if (!NAMESPACE_ID.test(value)) {
    throw new PhotoObjectKeyError(`${label} is not a safe storage identifier`);
  }
}

export function createPhotoObjectKey(input: {
  companyId: string;
  jobId: string;
}): string {
  assertNamespaceId(input.companyId, "companyId");
  assertNamespaceId(input.jobId, "jobId");

  const randomId = randomBytes(16).toString("hex");
  return `companies/${input.companyId}/jobs/${input.jobId}/photos/${randomId}.jpg`;
}

export function isPhotoObjectKey(objectKey: string): boolean {
  return PHOTO_OBJECT_KEY.test(objectKey);
}

export function assertPhotoObjectKey(objectKey: string): void {
  if (!isPhotoObjectKey(objectKey)) {
    throw new PhotoObjectKeyError("objectKey is outside the photo namespace");
  }
}
