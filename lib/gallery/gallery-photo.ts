export type GalleryPhoto = {
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

export type GalleryJobGroup<T extends GalleryPhoto> = {
  jobId: string;
  jobNumber: number;
  customerName: string;
  photos: T[];
  newestCreatedAt: string;
  oldestCreatedAt: string;
  uploaderLabel: string | null;
  stageLabel: string | null;
};

function polishPluralCategory(count: number): "one" | "few" | "many" {
  const n = Math.abs(Math.trunc(count));
  if (n === 1) return "one";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
  return "many";
}

export function polishPhotoNoun(count: number): string {
  const category = polishPluralCategory(count);
  if (category === "one") return "zdjęcie";
  if (category === "few") return "zdjęcia";
  return "zdjęć";
}

/**
 * Count of photos currently loaded into a group.
 * When later pages may still exist, the label says the count is only what
 * has been loaded, not the size of the whole job.
 */
export function formatLoadedPhotoCount(count: number, allLoaded: boolean): string {
  const noun = polishPhotoNoun(count);
  if (allLoaded) return `${count} ${noun}`;
  const adjective = polishPluralCategory(count) === "many" ? "wczytanych" : "wczytane";
  return `${count} ${noun} ${adjective}`;
}

export function formatJobGroupTitle(jobNumber: number, customerName: string): string {
  const customer = customerName.trim();
  const job = `Zlecenie nr ${jobNumber}`;
  return customer ? `${job} — ${customer}` : job;
}

export function formatGalleryGroupMeta(input: {
  dateLabel: string;
  uploaderLabel: string | null;
  stageLabel: string | null;
  count: number;
  allLoaded: boolean;
}): string {
  const parts = [input.dateLabel];
  if (input.stageLabel) parts.push(input.stageLabel);
  if (input.uploaderLabel) parts.push(input.uploaderLabel);
  parts.push(formatLoadedPhotoCount(input.count, input.allLoaded));
  return parts.filter((part) => part.trim().length > 0).join(" · ");
}

export function galleryPhotoAlt(photo: {
  job: { jobNumber: number; customerName: string };
  stage: { name: string } | null;
}): string {
  const parts = [`Zdjęcie zlecenia nr ${photo.job.jobNumber}`];
  const customer = photo.job.customerName.trim();
  const stage = photo.stage?.name.trim() ?? "";
  if (customer) parts.push(customer);
  if (stage) parts.push(`etap ${stage}`);
  return parts.join(", ");
}

/**
 * Groups already-loaded photos by job, in first-seen order.
 * The API returns newest photos first, so the first job is the one with
 * the newest loaded photo, and photos inside a job stay newest-first.
 */
export function groupGalleryPhotosByJob<T extends GalleryPhoto>(
  photos: readonly T[]
): GalleryJobGroup<T>[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();

  for (const photo of photos) {
    const list = map.get(photo.job.id);
    if (!list) {
      map.set(photo.job.id, [photo]);
      order.push(photo.job.id);
    } else {
      list.push(photo);
    }
  }

  return order.map((jobId) => {
    const groupPhotos = map.get(jobId) ?? [];
    const first = groupPhotos[0];
    let newestCreatedAt = first.createdAt;
    let oldestCreatedAt = first.createdAt;
    const uploaders = new Set<string>();
    const stages = new Set<string>();
    let missingStage = false;

    for (const photo of groupPhotos) {
      if (photo.createdAt > newestCreatedAt) newestCreatedAt = photo.createdAt;
      if (photo.createdAt < oldestCreatedAt) oldestCreatedAt = photo.createdAt;
      const name = photo.uploadedBy.displayName.trim();
      if (name) uploaders.add(name);
      const stageName = photo.stage?.name.trim() ?? "";
      if (stageName) stages.add(stageName);
      else missingStage = true;
    }

    return {
      jobId,
      jobNumber: first.job.jobNumber,
      customerName: first.job.customerName,
      photos: groupPhotos,
      newestCreatedAt,
      oldestCreatedAt,
      uploaderLabel: uploaders.size === 1 ? [...uploaders][0] : null,
      stageLabel: !missingStage && stages.size === 1 ? [...stages][0] : null,
    };
  });
}
