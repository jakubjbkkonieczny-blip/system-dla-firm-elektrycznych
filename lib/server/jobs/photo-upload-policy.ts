import "server-only";

/**
 * Upload policy for private job photos.
 *
 * Job visibility is a separate gate (assertMemberCanAccessJob).
 * CompanyMember.scope is intentionally not an input: scope=all does not grant upload.
 * There is no manager role. A stage supervisor is JobStage.supervisorUserId.
 */

export const PHOTO_JPEG_CONTENT_TYPE = "image/jpeg";

/** 2 MiB. The persisted object must not exceed this. */
export const PHOTO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

/** Short-lived signed PUT. Not the storage adapter's 7-day ceiling. */
export const PHOTO_UPLOAD_URL_TTL_SECONDS = 10 * 60;

const ORIGINAL_FILENAME_MAX_LENGTH = 120;

export type StoredPhotoRejection = "PHOTO_CONTENT_TYPE" | "PHOTO_EMPTY" | "PHOTO_TOO_LARGE";

export function canUploadJobPhoto(input: {
  role: string;
  jobStageId: string | null;
  isStageSupervisor: boolean;
  isAssignedToJob: boolean;
}): boolean {
  if (input.role === "owner" || input.role === "admin") return true;
  if (input.role !== "staff") return false;
  if (input.jobStageId === null) return false;
  return input.isStageSupervisor && input.isAssignedToJob;
}

/**
 * Display/audit filename only. Never used for objectKey or authorization.
 * Unsafe or awkward values become null.
 */
export function normalizeOriginalFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\0")) return null;

  const base = trimmed.split(/[/\\]/).pop()?.trim() ?? "";
  if (!base || base === "." || base === "..") return null;
  if (/[\u0000-\u001f\u007f]/.test(base)) return null;
  if (base.length > ORIGINAL_FILENAME_MAX_LENGTH) return null;
  return base;
}

/**
 * Decision from trusted storage metadata.
 * Browser-supplied type and size must not be passed here.
 */
export function storedPhotoRejection(input: {
  contentType: string;
  sizeBytes: number;
}): StoredPhotoRejection | null {
  const mediaType = input.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mediaType !== PHOTO_JPEG_CONTENT_TYPE) return "PHOTO_CONTENT_TYPE";
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) return "PHOTO_EMPTY";
  if (input.sizeBytes > PHOTO_MAX_SIZE_BYTES) return "PHOTO_TOO_LARGE";
  return null;
}
