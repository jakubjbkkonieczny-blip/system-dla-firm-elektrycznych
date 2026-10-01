/**
 * Shared photo limits. Safe for client and server bundles.
 * The stored-object ceiling is the same value the upload policy signs.
 */

/** Canonical stored photo media type. */
export const PHOTO_JPEG_CONTENT_TYPE = "image/jpeg" as const;

/** 2 MiB. The persisted object must not exceed this. */
export const PHOTO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Reject originals before decode so a phone does not decode a huge file.
 * This is larger than the stored ceiling because the client compresses first.
 */
export const PHOTO_ORIGINAL_MAX_BYTES = 15 * 1024 * 1024;

/** Maximum images selected for one stage-completion batch. */
export const PHOTO_MAX_FILES_PER_STAGE_BATCH = 10;

/** Longest side after scaling. Smaller images are not enlarged. */
export const PHOTO_MAX_LONG_SIDE_PX = 1600;

export const PHOTO_JPEG_QUALITY = 0.8;

/** Bounded extra passes when the first JPEG is still over 2 MiB. */
export const PHOTO_JPEG_QUALITY_FALLBACKS = [0.75, 0.68, 0.6] as const;
