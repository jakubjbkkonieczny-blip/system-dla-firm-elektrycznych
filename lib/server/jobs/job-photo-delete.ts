import "server-only";

/**
 * Owner-only JobPhoto deletion.
 *
 * CompanyMember.role must be exactly "owner". Admin, staff, and any other
 * role are refused. Stage supervisor, uploader, and account role are not
 * inputs to this decision.
 *
 * Storage is deleted before the database row. The object key always comes
 * from the company-scoped JobPhoto row.
 */

const PHOTO_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type JobPhotoDeleteMember = {
  role: string;
  isActive: boolean;
};

export type JobPhotoDeleteRow = {
  id: string;
  objectKey: string;
};

export type JobPhotoDeleteQuery = {
  id: string;
  companyId: string;
};

export type JobPhotoDeleteLog = (
  message: string,
  context: Record<string, string | number>
) => void;

export type DeleteCompanyPhotoInput = {
  companyId: string;
  photoId: string;
  member: JobPhotoDeleteMember;
  findPhoto: (query: JobPhotoDeleteQuery) => Promise<JobPhotoDeleteRow | null>;
  deleteBlob: (objectKey: string) => Promise<void>;
  deletePhotoRow: (query: JobPhotoDeleteQuery) => Promise<{ count: number }>;
  log?: JobPhotoDeleteLog;
};

/** True only for an owner. Inactive members are rejected separately. */
export function memberCanDeleteCompanyPhotos(member: { role: string }): boolean {
  return member.role === "owner";
}

export function assertOwnerCanDeleteJobPhoto(member: JobPhotoDeleteMember): void {
  if (!member.isActive) throw new Error("NOT_MEMBER");
  if (!memberCanDeleteCompanyPhotos(member)) throw new Error("FORBIDDEN");
}

function defaultLog(message: string, context: Record<string, string | number>): void {
  console.error(message, context);
}

/**
 * Deletes one company photo.
 * Blob deletion must succeed (or the object must already be absent) before
 * the JobPhoto row is removed. A storage failure leaves the row in place.
 */
export async function deleteAuthorizedCompanyPhoto(input: DeleteCompanyPhotoInput): Promise<void> {
  const {
    companyId,
    photoId,
    member,
    findPhoto,
    deleteBlob,
    deletePhotoRow,
    log = defaultLog,
  } = input;

  assertOwnerCanDeleteJobPhoto(member);

  if (!PHOTO_ID.test(photoId) || !PHOTO_ID.test(companyId)) {
    throw new Error("PHOTO_NOT_FOUND");
  }

  const query: JobPhotoDeleteQuery = { id: photoId, companyId };
  const row = await findPhoto(query);
  if (!row) throw new Error("PHOTO_NOT_FOUND");

  try {
    await deleteBlob(row.objectKey);
  } catch {
    log("job photo blob delete failed", { companyId, photoId });
    throw new Error("PHOTO_DELETE_FAILED");
  }

  let count = 0;
  try {
    const result = await deletePhotoRow(query);
    count = result.count;
  } catch {
    log("job photo row delete failed after blob delete", {
      companyId,
      photoId,
      objectKey: row.objectKey,
    });
    throw new Error("PHOTO_DELETE_INCOMPLETE");
  }

  if (count !== 1) {
    log("job photo row delete failed after blob delete", {
      companyId,
      photoId,
      objectKey: row.objectKey,
      deletedCount: count,
    });
    throw new Error("PHOTO_DELETE_INCOMPLETE");
  }
}
