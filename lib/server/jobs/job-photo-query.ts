import type { Prisma } from "@prisma/client";

import {
  memberSeesAllCompanyJobs,
  type JobVisibilityMember,
} from "@/lib/server/jobs/job-visibility";

/** UI page size. Callers may request up to GALLERY_MAX_PAGE_SIZE. */
export const GALLERY_PAGE_SIZE = 24;
export const GALLERY_MAX_PAGE_SIZE = 30;

/** Short-lived private read. Not the storage adapter's 7-day ceiling. */
export const PHOTO_READ_URL_TTL_SECONDS = 10 * 60;

export const GALLERY_FILTER_OPTION_LIMIT = 100;

/** Newest photos shown on one authorized job page, across stages and job level. */
export const JOB_PHOTO_DISPLAY_LIMIT = 200;

const FILTER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const HTTP_URL = /^https?:\/\//i;

export type GalleryPhotoCursor = {
  createdAt: Date;
  id: string;
};

export type GalleryPhotoRecord = {
  id: string;
  createdAt: Date;
  originalFilename: string | null;
  contentType: string;
  objectKey: string;
  job: { id: string; jobNumber: number; customerName: string };
  jobStage: { id: string; name: string } | null;
  uploadedBy: { id: string; displayName: string | null; email: string } | null;
};

export type GalleryPhotoDto = {
  id: string;
  createdAt: string;
  originalFilename: string | null;
  contentType: string;
  readUrl: string;
  readUrlExpiresAt: string;
  job: {
    id: string;
    jobNumber: number;
    customerName: string;
  };
  stage: { id: string; name: string } | null;
  uploadedBy: { id: string; displayName: string };
};

export type JobPhotoReadView = {
  id: string;
  createdAt: string;
  originalFilename: string | null;
  readUrl: string;
  readUrlExpiresAt: string;
};

export function clampGalleryLimit(raw: string | null | undefined): number {
  if (raw == null || raw === "") return GALLERY_PAGE_SIZE;
  if (!/^\d+$/.test(raw)) return GALLERY_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return GALLERY_PAGE_SIZE;
  return Math.max(1, Math.min(GALLERY_MAX_PAGE_SIZE, n));
}

/** Empty means no filter. Anything else must be a safe id, never an object key. */
export function parseGalleryIdFilter(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!FILTER_ID.test(trimmed)) throw new Error("INVALID_FILTER");
  return trimmed;
}

export function photoUploaderDisplayName(
  user: { displayName: string | null; email: string } | null | undefined
): string {
  const name = (user?.displayName ?? "").trim();
  if (name) return name;
  const email = (user?.email ?? "").trim();
  if (email) return email;
  return "Nieznany użytkownik";
}

/**
 * Historical JobStagePhoto values are rendered only when they are already
 * http(s) URLs. Storage paths and object keys are not treated as public URLs.
 */
export function legacyStagePhotoUrls(objectKeys: readonly string[]): string[] {
  const urls: string[] = [];
  for (const key of objectKeys) {
    if (typeof key !== "string") continue;
    const value = key.trim();
    if (HTTP_URL.test(value)) urls.push(value);
  }
  return urls;
}

export function encodePhotoCursor(input: GalleryPhotoCursor): string {
  const payload = `${input.createdAt.toISOString()}\n${input.id}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodePhotoCursor(value: string): GalleryPhotoCursor | null {
  if (!value || value.length > 512) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const splitAt = decoded.indexOf("\n");
  if (splitAt <= 0) return null;
  const iso = decoded.slice(0, splitAt);
  const id = decoded.slice(splitAt + 1);
  if (!FILTER_ID.test(id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) return null;
  return { createdAt, id };
}

/**
 * Jobs this member may already view. Deleted jobs stay excluded for every role.
 * Restricted staff are limited to their JobAssignment rows in the same company.
 */
export function visibleJobWhere(input: {
  companyId: string;
  userId: string;
  member: JobVisibilityMember;
}): Prisma.JobWhereInput {
  const seesAll = memberSeesAllCompanyJobs(input.member);
  return {
    companyId: input.companyId,
    deletedAt: null,
    ...(seesAll
      ? {}
      : {
          assignments: {
            some: {
              companyId: input.companyId,
              userId: input.userId,
            },
          },
        }),
  };
}

/**
 * Company gallery constraint. Visibility is part of the where clause so
 * pagination (take) cannot run over unauthorized rows.
 */
export function galleryJobPhotoWhere(input: {
  companyId: string;
  userId: string;
  member: JobVisibilityMember;
  jobId?: string | null;
  uploadedByUserId?: string | null;
  cursor?: GalleryPhotoCursor | null;
}): Prisma.JobPhotoWhereInput {
  const visibility: Prisma.JobPhotoWhereInput = {
    companyId: input.companyId,
    job: visibleJobWhere({
      companyId: input.companyId,
      userId: input.userId,
      member: input.member,
    }),
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.uploadedByUserId ? { uploadedByUserId: input.uploadedByUserId } : {}),
  };

  if (!input.cursor) return visibility;

  return {
    AND: [
      visibility,
      {
        OR: [
          { createdAt: { lt: input.cursor.createdAt } },
          {
            AND: [{ createdAt: input.cursor.createdAt }, { id: { lt: input.cursor.id } }],
          },
        ],
      },
    ],
  };
}

export function toGalleryPhotoDto(
  row: GalleryPhotoRecord,
  read: { readUrl: string; expiresAt: string }
): GalleryPhotoDto {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    readUrl: read.readUrl,
    readUrlExpiresAt: read.expiresAt,
    job: {
      id: row.job.id,
      jobNumber: row.job.jobNumber,
      customerName: row.job.customerName,
    },
    stage: row.jobStage ? { id: row.jobStage.id, name: row.jobStage.name } : null,
    uploadedBy: {
      id: row.uploadedBy?.id ?? "",
      displayName: photoUploaderDisplayName(row.uploadedBy),
    },
  };
}

export function toJobPhotoReadView(
  row: {
    id: string;
    createdAt: Date;
    originalFilename: string | null;
  },
  read: { readUrl: string; expiresAt: string }
): JobPhotoReadView {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    originalFilename: row.originalFilename,
    readUrl: read.readUrl,
    readUrlExpiresAt: read.expiresAt,
  };
}
