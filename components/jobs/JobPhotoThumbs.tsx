"use client";

export type JobPhotoThumb = {
  id: string;
  readUrl: string;
  originalFilename?: string | null;
};

function photoLabel(photo: JobPhotoThumb, index: number): string {
  const name = photo.originalFilename?.trim();
  return name || `Zdjęcie ${index + 1}`;
}

export function JobPhotoThumbs({ photos }: { photos: JobPhotoThumb[] }) {
  if (photos.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {photos.map((photo, index) => {
        const label = photoLabel(photo, index);
        return (
          <a
            key={photo.id}
            href={photo.readUrl}
            target="_blank"
            rel="noreferrer"
            className="block"
            title={label}
          >
            <img
              src={photo.readUrl}
              alt={label}
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
              className="w-20 h-20 object-cover rounded-lg border border-border bg-card"
            />
          </a>
        );
      })}
    </div>
  );
}
