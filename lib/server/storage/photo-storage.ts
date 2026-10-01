import "server-only";

/**
 * Private photo object storage.
 *
 * Callers identify objects by objectKey. A provider URL is not an identity
 * and must not be stored on JobPhoto. Authorization is a database concern;
 * objectKey is only a storage path.
 *
 * A later R2 or S3 adapter implements PhotoStorage. Application code should
 * depend on this contract and getPhotoStorage(), not on a provider SDK.
 */

export const PHOTO_SIGNED_URL_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

export class PhotoStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoStorageError";
  }
}

/** Body types a provider can store without knowing the caller's HTTP stack. */
export type PhotoObjectBody =
  | string
  | ArrayBuffer
  | Buffer
  | Blob
  | ReadableStream<Uint8Array>;

export type StorePhotoObjectInput = {
  objectKey: string;
  body: PhotoObjectBody;
  contentType: string;
};

export type StoredPhotoObject = {
  objectKey: string;
  contentType: string;
};

export type CreatePhotoUploadUrlInput = {
  objectKey: string;
  contentType: string;
  ttlSeconds: number;
  maximumSizeInBytes?: number;
};

export type PhotoUploadUrl = {
  objectKey: string;
  uploadUrl: string;
  expiresAt: Date;
};

export type CreatePhotoReadUrlInput = {
  objectKey: string;
  ttlSeconds: number;
};

export type PhotoReadUrl = {
  objectKey: string;
  readUrl: string;
  expiresAt: Date;
};

export type PhotoStorage = {
  store(input: StorePhotoObjectInput): Promise<StoredPhotoObject>;
  delete(objectKey: string): Promise<void>;
  createUploadUrl(input: CreatePhotoUploadUrlInput): Promise<PhotoUploadUrl>;
  createReadUrl(input: CreatePhotoReadUrlInput): Promise<PhotoReadUrl>;
};
