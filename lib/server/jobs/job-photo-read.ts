import "server-only";

import type { JobVisibilityMember } from "@/lib/server/jobs/job-visibility";
import { jobStageToPl, type StageWithPhotos } from "@/lib/server/jobs/job-stage-dto";
import {
  decodePhotoCursor,
  encodePhotoCursor,
  galleryJobPhotoWhere,
  GALLERY_FILTER_OPTION_LIMIT,
  JOB_PHOTO_DISPLAY_LIMIT,
  photoUploaderDisplayName,
  PHOTO_READ_URL_TTL_SECONDS,
  toGalleryPhotoDto,
  toJobPhotoReadView,
  visibleJobWhere,
  type GalleryPhotoDto,
  type GalleryPhotoRecord,
  type JobPhotoReadView,
} from "@/lib/server/jobs/job-photo-query";
import { prisma } from "@/lib/db/prisma";
import { memberCanDeleteCompanyPhotos } from "@/lib/server/jobs/job-photo-delete";
import { getPhotoStorage } from "@/lib/server/storage/get-photo-storage";
import { PhotoStorageError } from "@/lib/server/storage/photo-storage";

const SIGN_BATCH_SIZE = 8;

const gallerySelect = {
  id: true,
  createdAt: true,
  originalFilename: true,
  contentType: true,
  objectKey: true,
  job: { select: { id: true, jobNumber: true, customerName: true } },
  jobStage: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, displayName: true, email: true } },
} as const;

export type GalleryListResult = {
  photos: GalleryPhotoDto[];
  nextCursor: string | null;
  canDeletePhotos: boolean;
  filters?: {
    jobs: { id: string; jobNumber: number; customerName: string }[];
    uploaders: { id: string; displayName: string }[];
  };
};

type SignablePhoto = { id: string; objectKey: string };

/**
 * Signs reads only for rows the caller already loaded through an authorized query.
 * objectKey is a storage path, not an authorization input, and is not returned.
 */
async function signAuthorizedPhotoReads(
  rows: SignablePhoto[]
): Promise<Map<string, { readUrl: string; expiresAt: string }>> {
  if (rows.length === 0) return new Map();

  const storage = getPhotoStorage();
  const signed = new Map<string, { readUrl: string; expiresAt: string }>();

  try {
    for (let index = 0; index < rows.length; index += SIGN_BATCH_SIZE) {
      const batch = rows.slice(index, index + SIGN_BATCH_SIZE);
      const reads = await Promise.all(
        batch.map(async (row) => {
          const result = await storage.createReadUrl({
            objectKey: row.objectKey,
            ttlSeconds: PHOTO_READ_URL_TTL_SECONDS,
          });
          if (!result.readUrl) throw new PhotoStorageError("photo read url is empty");
          return {
            id: row.id,
            readUrl: result.readUrl,
            expiresAt: result.expiresAt.toISOString(),
          };
        })
      );
      for (const read of reads) {
        signed.set(read.id, { readUrl: read.readUrl, expiresAt: read.expiresAt });
      }
    }
  } catch (error) {
    if (error instanceof PhotoStorageError) {
      console.error("photo read url failed");
      throw new Error("PHOTO_STORAGE_UNAVAILABLE");
    }
    console.error("photo read url failed");
    throw new Error("PHOTO_STORAGE_UNAVAILABLE");
  }

  return signed;
}

async function loadGalleryFilters(input: {
  companyId: string;
  userId: string;
  member: JobVisibilityMember;
}): Promise<GalleryListResult["filters"]> {
  const visibility = galleryJobPhotoWhere({
    companyId: input.companyId,
    userId: input.userId,
    member: input.member,
  });

  const [jobs, uploaderRows] = await Promise.all([
    prisma.job.findMany({
      where: visibleJobWhere(input),
      select: { id: true, jobNumber: true, customerName: true },
      orderBy: { jobNumber: "desc" },
      take: GALLERY_FILTER_OPTION_LIMIT,
    }),
    prisma.jobPhoto.findMany({
      where: visibility,
      distinct: ["uploadedByUserId"],
      select: {
        uploadedByUserId: true,
        uploadedBy: { select: { id: true, displayName: true, email: true } },
      },
      take: GALLERY_FILTER_OPTION_LIMIT,
    }),
  ]);

  const uploaders = uploaderRows
    .map((row) => ({
      id: row.uploadedBy.id,
      displayName: photoUploaderDisplayName(row.uploadedBy),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pl"));

  return { jobs, uploaders };
}

export async function listCompanyGalleryPhotos(input: {
  companyId: string;
  userId: string;
  member: JobVisibilityMember;
  limit: number;
  cursor?: string | null;
  jobId?: string | null;
  uploadedByUserId?: string | null;
}): Promise<GalleryListResult> {
  const cursor = input.cursor ? decodePhotoCursor(input.cursor) : null;
  if (input.cursor && !cursor) throw new Error("INVALID_CURSOR");

  const where = galleryJobPhotoWhere({
    companyId: input.companyId,
    userId: input.userId,
    member: input.member,
    jobId: input.jobId,
    uploadedByUserId: input.uploadedByUserId,
    cursor,
  });

  const rows = await prisma.jobPhoto.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: gallerySelect,
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const signed = await signAuthorizedPhotoReads(page);
  const photos = page.map((row) => {
    const read = signed.get(row.id);
    if (!read) throw new Error("PHOTO_STORAGE_UNAVAILABLE");
    return toGalleryPhotoDto(row as GalleryPhotoRecord, read);
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodePhotoCursor({ createdAt: last.createdAt, id: last.id })
      : null;

  const filters = input.cursor ? undefined : await loadGalleryFilters(input);

  return {
    photos,
    nextCursor,
    canDeletePhotos: memberCanDeleteCompanyPhotos(input.member),
    filters,
  };
}

type JobDisplayRow = {
  id: string;
  jobStageId: string | null;
  createdAt: Date;
  originalFilename: string | null;
  objectKey: string;
  jobStage: { id: string; name: string } | null;
};

export async function loadJobPhotoDisplay(input: {
  companyId: string;
  jobId: string;
}): Promise<{
  byStageId: Map<string, JobPhotoReadView[]>;
  jobLevel: JobPhotoReadView[];
}> {
  const rows = await prisma.jobPhoto.findMany({
    where: {
      companyId: input.companyId,
      jobId: input.jobId,
      job: { companyId: input.companyId, id: input.jobId, deletedAt: null },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: JOB_PHOTO_DISPLAY_LIMIT,
    select: {
      id: true,
      jobStageId: true,
      createdAt: true,
      originalFilename: true,
      objectKey: true,
      jobStage: { select: { id: true, name: true } },
    },
  });

  const signed = await signAuthorizedPhotoReads(rows);
  const byStageId = new Map<string, JobPhotoReadView[]>();
  const jobLevel: JobPhotoReadView[] = [];

  for (const row of rows as JobDisplayRow[]) {
    const read = signed.get(row.id);
    if (!read) throw new Error("PHOTO_STORAGE_UNAVAILABLE");
    const view = toJobPhotoReadView(row, read);
    if (row.jobStageId && row.jobStage && row.jobStage.id === row.jobStageId) {
      const list = byStageId.get(row.jobStageId) ?? [];
      list.push(view);
      byStageId.set(row.jobStageId, list);
    } else {
      jobLevel.push(view);
    }
  }

  return { byStageId, jobLevel };
}

/**
 * Caller must already have authorized this job. Photos are still constrained
 * to companyId + jobId. Stage-bound rows stay on their stage; a null
 * jobStageId (including after stage delete) is returned as job-level.
 */
export async function serializeStagesWithJobPhotos(input: {
  companyId: string;
  jobId: string;
  rows: StageWithPhotos[];
}) {
  const display = await loadJobPhotoDisplay({
    companyId: input.companyId,
    jobId: input.jobId,
  });

  return {
    stages: input.rows.map((row) => jobStageToPl(row, display.byStageId.get(row.id) ?? [])),
    zdjecia_zlecenia: display.jobLevel,
  };
}
