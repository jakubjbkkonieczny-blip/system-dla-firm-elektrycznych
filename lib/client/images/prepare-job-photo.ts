import {
  PHOTO_JPEG_CONTENT_TYPE,
  PHOTO_JPEG_QUALITY,
  PHOTO_JPEG_QUALITY_FALLBACKS,
  PHOTO_MAX_FILES_PER_STAGE_BATCH,
  PHOTO_MAX_LONG_SIDE_PX,
  PHOTO_MAX_SIZE_BYTES,
  PHOTO_ORIGINAL_MAX_BYTES,
} from "@/lib/jobs/photo-limits";
import {
  JobPhotoClientError,
  PHOTO_BATCH_TOO_MANY,
  photoEncodeMessage,
  photoFormatMessage,
  photoTooLargeMessage,
} from "@/lib/client/images/job-photo-messages";

export const JPEG_QUALITY_STEPS = [PHOTO_JPEG_QUALITY, ...PHOTO_JPEG_QUALITY_FALLBACKS] as const;

export type EncodedJpegDecision = "accept" | "retry_quality" | "too_large" | "reject";

export function stagePhotoBatchError(count: number): string | null {
  if (!Number.isInteger(count) || count < 0 || count > PHOTO_MAX_FILES_PER_STAGE_BATCH) {
    return PHOTO_BATCH_TOO_MANY;
  }
  return null;
}

export function originalPhotoInputError(file: { name: string; type: string; size: number }): string | null {
  if (!file.type.startsWith("image/")) return photoFormatMessage(file.name);
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > PHOTO_ORIGINAL_MAX_BYTES) {
    return photoTooLargeMessage(file.name);
  }
  return null;
}

export function scaledPhotoDimensions(
  width: number,
  height: number,
  maxSide = PHOTO_MAX_LONG_SIDE_PX
): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (width <= maxSide && height <= maxSide) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  if (width >= height) {
    return {
      width: maxSide,
      height: Math.max(1, Math.round((height * maxSide) / width)),
    };
  }
  return {
    width: Math.max(1, Math.round((width * maxSide) / height)),
    height: maxSide,
  };
}

/**
 * Quality 0.8 is enough for a normal photo. Larger results step through a
 * fixed list and then fail. There is no path that returns the original file.
 */
export function decideEncodedJpeg(
  input: { type: string; size: number },
  qualityIndex: number,
  qualityCount = JPEG_QUALITY_STEPS.length
): EncodedJpegDecision {
  if (input.type && input.type !== PHOTO_JPEG_CONTENT_TYPE) return "reject";
  if (!Number.isSafeInteger(input.size) || input.size <= 0) return "reject";
  if (input.size <= PHOTO_MAX_SIZE_BYTES) return "accept";
  if (qualityIndex < qualityCount - 1) return "retry_quality";
  return "too_large";
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => resolve(blob), PHOTO_JPEG_CONTENT_TYPE, quality);
    } catch (error) {
      reject(error);
    }
  });
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("DECODE_FAILED"));
    image.src = url;
  });
}

function withJpegType(blob: Blob): Blob {
  if (blob.type === PHOTO_JPEG_CONTENT_TYPE) return blob;
  return new Blob([blob], { type: PHOTO_JPEG_CONTENT_TYPE });
}

export async function prepareJobPhoto(file: File): Promise<Blob> {
  const inputError = originalPhotoInputError(file);
  if (inputError) throw new JobPhotoClientError(inputError);

  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new JobPhotoClientError(photoFormatMessage(file.name));
  }

  const imgUrl = URL.createObjectURL(file);
  try {
    let image: HTMLImageElement;
    try {
      image = await decodeImage(imgUrl);
    } catch {
      throw new JobPhotoClientError(photoFormatMessage(file.name));
    }

    const size = scaledPhotoDimensions(image.width, image.height);
    if (!size) throw new JobPhotoClientError(photoFormatMessage(file.name));
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new JobPhotoClientError(photoEncodeMessage(file.name));

    try {
      context.drawImage(image, 0, 0, size.width, size.height);
    } catch {
      throw new JobPhotoClientError(photoEncodeMessage(file.name));
    }

    for (let index = 0; index < JPEG_QUALITY_STEPS.length; index += 1) {
      let blob: Blob | null;
      try {
        blob = await canvasToJpeg(canvas, JPEG_QUALITY_STEPS[index]);
      } catch {
        throw new JobPhotoClientError(photoEncodeMessage(file.name));
      }
      if (!blob) throw new JobPhotoClientError(photoEncodeMessage(file.name));

      const decision = decideEncodedJpeg({ type: blob.type, size: blob.size }, index);
      if (decision === "accept") return withJpegType(blob);
      if (decision === "retry_quality") continue;
      if (decision === "too_large") throw new JobPhotoClientError(photoTooLargeMessage(file.name));
      throw new JobPhotoClientError(photoEncodeMessage(file.name));
    }

    throw new JobPhotoClientError(photoTooLargeMessage(file.name));
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}
