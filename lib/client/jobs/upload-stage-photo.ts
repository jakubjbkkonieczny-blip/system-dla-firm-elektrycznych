import { apiFetch } from "@/lib/api";
import {
  JobPhotoClientError,
  photoEncodeMessage,
  photoFormatMessage,
  photoTooLargeMessage,
  photoUploadMessage,
} from "@/lib/client/images/job-photo-messages";
import {
  decideEncodedJpeg,
  JPEG_QUALITY_STEPS,
  prepareJobPhoto,
} from "@/lib/client/images/prepare-job-photo";
import { PHOTO_JPEG_CONTENT_TYPE } from "@/lib/jobs/photo-limits";

export type PresignedStagePhoto = {
  objectKey: string;
  uploadUrl: string;
  uploadIntent: string;
  jobStageId: string | null;
  originalFilename: string | null;
  contentType: typeof PHOTO_JPEG_CONTENT_TYPE;
  maximumSizeBytes: number;
};

export type JpegPutRequest = {
  url: string;
  init: RequestInit;
};

export type StagePhotoProgress = {
  completed: number;
  total: number;
  current: number | null;
};

type PostJson = (path: string, body: Record<string, unknown>) => Promise<unknown>;

export type UploadStagePhotoDeps = {
  postJson: PostJson;
  putJpeg: (request: JpegPutRequest) => Promise<boolean>;
  prepare: (file: File) => Promise<Blob>;
};

function isOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 4096 && !/[\u0000-\u001f\u007f\s]/.test(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function photoUploadUrlPath(companyId: string, jobId: string): string {
  return `/api/companies/${companyId}/jobs/${jobId}/photos/upload-url`;
}

export function photoFinalizePath(companyId: string, jobId: string): string {
  return `/api/companies/${companyId}/jobs/${jobId}/photos/finalize`;
}

export function buildPresignBody(jobStageId: string, originalFilename: string): Record<string, unknown> {
  return { jobStageId, originalFilename };
}

export function buildFinalizeBody(presign: PresignedStagePhoto): Record<string, unknown> {
  return {
    uploadIntent: presign.uploadIntent,
    objectKey: presign.objectKey,
    jobStageId: presign.jobStageId,
    originalFilename: presign.originalFilename,
  };
}

export function parsePresignPayload(value: unknown): PresignedStagePhoto | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.objectKey !== "string" || !record.objectKey || /[\u0000-\u001f\u007f\s]/.test(record.objectKey)) {
    return null;
  }
  if (!isHttpsUrl(record.uploadUrl) || !isOpaqueToken(record.uploadIntent)) return null;
  if (record.contentType !== PHOTO_JPEG_CONTENT_TYPE) return null;
  if (typeof record.maximumSizeBytes !== "number" || !Number.isSafeInteger(record.maximumSizeBytes)) return null;
  if (record.maximumSizeBytes <= 0) return null;

  let jobStageId: string | null;
  if (record.jobStageId === null) jobStageId = null;
  else if (typeof record.jobStageId === "string" && record.jobStageId.trim()) jobStageId = record.jobStageId;
  else return null;

  let originalFilename: string | null;
  if (record.originalFilename === null) originalFilename = null;
  else if (typeof record.originalFilename === "string") originalFilename = record.originalFilename;
  else return null;

  return {
    objectKey: record.objectKey,
    uploadUrl: record.uploadUrl,
    uploadIntent: record.uploadIntent,
    jobStageId,
    originalFilename,
    contentType: PHOTO_JPEG_CONTENT_TYPE,
    maximumSizeBytes: record.maximumSizeBytes,
  };
}

export function buildJpegPutRequest(uploadUrl: string, jpeg: Blob): JpegPutRequest {
  return {
    url: uploadUrl,
    init: {
      method: "PUT",
      credentials: "omit",
      cache: "no-store",
      headers: { "Content-Type": PHOTO_JPEG_CONTENT_TYPE },
      body: jpeg,
    },
  };
}

async function defaultPostJson(path: string, body: Record<string, unknown>): Promise<unknown> {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function defaultPutJpeg(request: JpegPutRequest): Promise<boolean> {
  const response = await fetch(request.url, request.init);
  return response.ok;
}

const defaultDeps: UploadStagePhotoDeps = {
  postJson: defaultPostJson,
  putJpeg: defaultPutJpeg,
  prepare: prepareJobPhoto,
};

function stampJpeg(blob: Blob): Blob {
  if (blob.type === PHOTO_JPEG_CONTENT_TYPE) return blob;
  return new Blob([blob], { type: PHOTO_JPEG_CONTENT_TYPE });
}

export async function uploadOneStagePhoto(
  input: {
    companyId: string;
    jobId: string;
    jobStageId: string;
    file: File;
  },
  deps: UploadStagePhotoDeps = defaultDeps
): Promise<void> {
  let jpeg: Blob;
  try {
    jpeg = await deps.prepare(input.file);
  } catch (error) {
    if (error instanceof JobPhotoClientError) throw error;
    throw new JobPhotoClientError(photoFormatMessage(input.file.name));
  }

  if (jpeg === input.file) {
    throw new JobPhotoClientError(photoEncodeMessage(input.file.name));
  }

  const prepared = decideEncodedJpeg(
    { type: jpeg.type, size: jpeg.size },
    JPEG_QUALITY_STEPS.length - 1
  );
  if (prepared !== "accept") {
    throw new JobPhotoClientError(
      prepared === "too_large" ? photoTooLargeMessage(input.file.name) : photoEncodeMessage(input.file.name)
    );
  }
  const jpegBody = stampJpeg(jpeg);

  let presignRaw: unknown;
  try {
    presignRaw = await deps.postJson(
      photoUploadUrlPath(input.companyId, input.jobId),
      buildPresignBody(input.jobStageId, input.file.name)
    );
  } catch {
    throw new JobPhotoClientError(photoUploadMessage(input.file.name));
  }

  const presign = parsePresignPayload(presignRaw);
  if (!presign || presign.jobStageId !== input.jobStageId) {
    throw new JobPhotoClientError(photoUploadMessage(input.file.name));
  }
  if (jpegBody.size > presign.maximumSizeBytes) {
    throw new JobPhotoClientError(photoTooLargeMessage(input.file.name));
  }

  let uploaded = false;
  try {
    uploaded = await deps.putJpeg(buildJpegPutRequest(presign.uploadUrl, jpegBody));
  } catch {
    throw new JobPhotoClientError(photoUploadMessage(input.file.name));
  }
  if (!uploaded) {
    throw new JobPhotoClientError(photoUploadMessage(input.file.name));
  }

  try {
    await deps.postJson(photoFinalizePath(input.companyId, input.jobId), buildFinalizeBody(presign));
  } catch {
    throw new JobPhotoClientError(photoUploadMessage(input.file.name));
  }
}

export async function uploadStagePhotoSequence<T>(input: {
  files: readonly T[];
  finalized: ReadonlySet<T>;
  uploadOne: (file: T) => Promise<void>;
  onFinalized: (file: T) => void;
  onProgress: (progress: StagePhotoProgress) => void;
}): Promise<void> {
  const total = input.files.length;
  let completed = 0;
  for (const file of input.files) {
    if (input.finalized.has(file)) completed += 1;
  }

  for (let index = 0; index < input.files.length; index += 1) {
    const file = input.files[index];
    if (input.finalized.has(file)) continue;
    input.onProgress({ completed, total, current: index + 1 });
    await input.uploadOne(file);
    input.onFinalized(file);
    completed += 1;
    input.onProgress({ completed, total, current: null });
  }
}
