import "server-only";
import {
  BlobNotFoundError,
  del,
  head,
  issueSignedToken,
  presignUrl,
  put,
  type HeadBlobResult,
} from "@vercel/blob";

import { assertPhotoObjectKey } from "@/lib/server/storage/photo-object-key";
import {
  PHOTO_SIGNED_URL_MAX_TTL_SECONDS,
  PhotoStorageError,
  type CreatePhotoReadUrlInput,
  type CreatePhotoUploadUrlInput,
  type PhotoObjectHead,
  type PhotoReadUrl,
  type PhotoStorage,
  type PhotoUploadUrl,
  type StorePhotoObjectInput,
  type StoredPhotoObject,
} from "@/lib/server/storage/photo-storage";

/**
 * Vercel Private Blob adapter.
 *
 * Credentials are not passed in. On Vercel the SDK authenticates with runtime
 * OIDC. Importing this module does not call the storage service.
 */

const CONTENT_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

function assertContentType(contentType: string): void {
  if (contentType.length < 3 || contentType.length > 127 || !CONTENT_TYPE.test(contentType)) {
    throw new PhotoStorageError("contentType is not valid");
  }
}

function expiresAtFromTtl(ttlSeconds: number): Date {
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > PHOTO_SIGNED_URL_MAX_TTL_SECONDS
  ) {
    throw new PhotoStorageError("ttlSeconds is outside the allowed range");
  }
  return new Date(Date.now() + ttlSeconds * 1000);
}

function assertMaximumSize(maximumSizeInBytes: number | undefined): void {
  if (maximumSizeInBytes === undefined) return;
  if (!Number.isSafeInteger(maximumSizeInBytes) || maximumSizeInBytes < 1) {
    throw new PhotoStorageError("maximumSizeInBytes is not valid");
  }
}

async function store(input: StorePhotoObjectInput): Promise<StoredPhotoObject> {
  assertPhotoObjectKey(input.objectKey);
  assertContentType(input.contentType);

  const result = await put(input.objectKey, input.body, {
    access: "private",
    contentType: input.contentType,
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  if (result.pathname !== input.objectKey) {
    throw new PhotoStorageError("storage provider returned a different object key");
  }

  return {
    objectKey: input.objectKey,
    contentType: result.contentType,
  };
}

async function deleteObject(objectKey: string): Promise<void> {
  assertPhotoObjectKey(objectKey);
  await del(objectKey);
}

async function createUploadUrl(input: CreatePhotoUploadUrlInput): Promise<PhotoUploadUrl> {
  assertPhotoObjectKey(input.objectKey);
  assertContentType(input.contentType);
  assertMaximumSize(input.maximumSizeInBytes);
  const expiresAt = expiresAtFromTtl(input.ttlSeconds);
  const validUntil = expiresAt.getTime();

  const signed = await issueSignedToken({
    pathname: input.objectKey,
    operations: ["put"],
    validUntil,
    allowedContentTypes: [input.contentType],
    maximumSizeInBytes: input.maximumSizeInBytes,
  });

  const { presignedUrl } = await presignUrl(signed, {
    access: "private",
    operation: "put",
    pathname: input.objectKey,
    validUntil,
    allowedContentTypes: [input.contentType],
    maximumSizeInBytes: input.maximumSizeInBytes,
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  return {
    objectKey: input.objectKey,
    uploadUrl: presignedUrl,
    expiresAt,
  };
}

/**
 * Control-plane metadata read using the SDK's server credentials.
 * `head` does not accept an access option in this SDK; privacy is enforced
 * because the call is authenticated as the store, not as a public URL.
 * A missing object is reported as null. Other provider failures stay generic.
 */
async function headObject(objectKey: string): Promise<PhotoObjectHead | null> {
  assertPhotoObjectKey(objectKey);

  let result: HeadBlobResult;
  try {
    result = await head(objectKey);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw new PhotoStorageError("photo object metadata could not be read");
  }

  if (
    result.pathname !== objectKey ||
    typeof result.contentType !== "string" ||
    typeof result.size !== "number" ||
    !Number.isFinite(result.size)
  ) {
    throw new PhotoStorageError("photo object metadata could not be read");
  }

  return {
    objectKey,
    contentType: result.contentType,
    sizeBytes: result.size,
  };
}

async function createReadUrl(input: CreatePhotoReadUrlInput): Promise<PhotoReadUrl> {
  assertPhotoObjectKey(input.objectKey);
  const expiresAt = expiresAtFromTtl(input.ttlSeconds);
  const validUntil = expiresAt.getTime();

  const signed = await issueSignedToken({
    pathname: input.objectKey,
    operations: ["get"],
    validUntil,
  });

  const { presignedUrl } = await presignUrl(signed, {
    access: "private",
    operation: "get",
    pathname: input.objectKey,
    validUntil,
  });

  return {
    objectKey: input.objectKey,
    readUrl: presignedUrl,
    expiresAt,
  };
}

export const vercelPhotoStorage: PhotoStorage = {
  store,
  delete: deleteObject,
  createUploadUrl,
  createReadUrl,
  head: headObject,
};
