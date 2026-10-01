"use client";

import { PhotoLightbox } from "@/components/gallery/PhotoLightbox";
import { apiFetch } from "@/lib/api";
import {
  formatGalleryGroupMeta,
  formatJobGroupTitle,
  galleryPhotoAlt,
  groupGalleryPhotosByJob,
  type GalleryPhoto,
} from "@/lib/gallery/gallery-photo";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type GalleryFilters = {
  jobs: { id: string; jobNumber: number; customerName: string }[];
  uploaders: { id: string; displayName: string }[];
};

type GalleryResponse = {
  photos?: GalleryPhoto[];
  nextCursor?: string | null;
  canDeletePhotos?: boolean;
  filters?: GalleryFilters;
};

const dayFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dayFormat.format(date);
}

function galleryErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "NOT_MEMBER" || code === "FORBIDDEN" || code === "Unauthorized") {
    return "Brak dostępu do galerii.";
  }
  return "Nie udało się wczytać zdjęć. Spróbuj ponownie.";
}

function deleteErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "NOT_MEMBER" || code === "FORBIDDEN" || code === "Unauthorized") {
    return "Nie masz uprawnień do usunięcia tego zdjęcia.";
  }
  if (code === "PHOTO_NOT_FOUND") {
    return "Nie znaleziono zdjęcia. Odśwież galerię.";
  }
  if (code === "PHOTO_DELETE_INCOMPLETE") {
    return "Usuwanie zdjęcia nie zostało dokończone. Spróbuj ponownie.";
  }
  return "Nie udało się usunąć zdjęcia. Spróbuj ponownie.";
}

export function PhotoGallery() {
  const companyId = useActiveCompanyId();
  return <PhotoGalleryView key={companyId || "none"} companyId={companyId} />;
}

function PhotoGalleryView({ companyId }: { companyId: string }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [filters, setFilters] = useState<GalleryFilters>({ jobs: [], uploaders: [] });
  const [jobId, setJobId] = useState("");
  const [uploaderId, setUploaderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [brokenIds, setBrokenIds] = useState<string[]>([]);
  const photosRef = useRef(photos);
  const deletingRef = useRef(false);
  photosRef.current = photos;

  useEffect(() => {
    if (!companyId) {
      setPhotos([]);
      setNextCursor(null);
      setCanDelete(false);
      setLoading(false);
      setError(null);
      setSelectedId(null);
      return;
    }

    let cancelled = false;
    setPhotos([]);
    setNextCursor(null);
    setCanDelete(false);
    setLoading(true);
    setError(null);
    setSelectedId(null);
    setDeleteError(null);
    setBrokenIds([]);

    const qs = new URLSearchParams();
    if (jobId) qs.set("jobId", jobId);
    if (uploaderId) qs.set("uploadedByUserId", uploaderId);
    const query = qs.toString();

    apiFetch(`/api/companies/${companyId}/photos${query ? `?${query}` : ""}`)
      .then((data: GalleryResponse) => {
        if (cancelled) return;
        setPhotos(Array.isArray(data.photos) ? data.photos : []);
        setNextCursor(data.nextCursor ?? null);
        setCanDelete(data.canDeletePhotos === true);
        if (data.filters) {
          setFilters({
            jobs: Array.isArray(data.filters.jobs) ? data.filters.jobs : [],
            uploaders: Array.isArray(data.filters.uploaders) ? data.filters.uploaders : [],
          });
        }
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setPhotos([]);
        setNextCursor(null);
        setCanDelete(false);
        setError(galleryErrorMessage(loadError));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, jobId, uploaderId, reloadKey]);

  const groups = useMemo(() => groupGalleryPhotosByJob(photos), [photos]);
  const selected = photos.find((photo) => photo.id === selectedId) ?? null;
  const selectedGroup = selected ? groups.find((group) => group.jobId === selected.job.id) : null;
  const selectedIndex = selectedGroup
    ? selectedGroup.photos.findIndex((photo) => photo.id === selected?.id)
    : -1;
  const previousPhoto =
    selectedGroup && selectedIndex > 0 ? selectedGroup.photos[selectedIndex - 1] : null;
  const nextPhoto =
    selectedGroup && selectedIndex >= 0 && selectedIndex < selectedGroup.photos.length - 1
      ? selectedGroup.photos[selectedIndex + 1]
      : null;

  async function loadMore() {
    if (!companyId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("cursor", nextCursor);
      if (jobId) qs.set("jobId", jobId);
      if (uploaderId) qs.set("uploadedByUserId", uploaderId);
      const data = (await apiFetch(
        `/api/companies/${companyId}/photos?${qs.toString()}`
      )) as GalleryResponse;
      const page = Array.isArray(data.photos) ? data.photos : [];
      setPhotos((current) => {
        const seen = new Set(current.map((photo) => photo.id));
        return current.concat(page.filter((photo) => !seen.has(photo.id)));
      });
      setNextCursor(data.nextCursor ?? null);
      if (typeof data.canDeletePhotos === "boolean") setCanDelete(data.canDeletePhotos);
    } catch (loadError: unknown) {
      setError(galleryErrorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  }

  function closeLightbox() {
    if (deletingId) return;
    setSelectedId(null);
    setDeleteError(null);
  }

  function reloadGallery() {
    if (deletingId) return;
    setSelectedId(null);
    setDeleteError(null);
    setReloadKey((value) => value + 1);
  }

  async function confirmDelete() {
    if (!companyId || !selected || deletingRef.current) return;
    const photoId = selected.id;
    deletingRef.current = true;
    setDeletingId(photoId);
    setDeleteError(null);
    try {
      await apiFetch(`/api/companies/${companyId}/photos/${photoId}`, { method: "DELETE" });
      const current = photosRef.current;
      const index = current.findIndex((photo) => photo.id === photoId);
      const removed = current[index];
      const remaining = current.filter((photo) => photo.id !== photoId);
      setPhotos(remaining);
      if (!removed) {
        setSelectedId(null);
        return;
      }
      const following = current.slice(index + 1).find((photo) => photo.job.id === removed.job.id);
      const siblings = remaining.filter((photo) => photo.job.id === removed.job.id);
      setSelectedId(following?.id ?? siblings[siblings.length - 1]?.id ?? null);
    } catch (deleteFailure: unknown) {
      setDeleteError(deleteErrorMessage(deleteFailure));
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  }

  if (!companyId) {
    return (
      <div className="w-full max-w-full min-w-0">
        <GalleryHeading />
        <p className="mt-3 text-sm text-text-muted">Wybierz firmę, aby zobaczyć galerię.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-4">
      <GalleryHeading />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block min-w-0 space-y-1">
          <span className="text-xs text-text-muted">Zlecenie</span>
          <select
            className="w-full min-h-[44px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          >
            <option value="">Wszystkie zlecenia</option>
            {filters.jobs.map((job) => (
              <option key={job.id} value={job.id}>
                Zlecenie nr {job.jobNumber}
                {job.customerName ? ` · ${job.customerName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 space-y-1">
          <span className="text-xs text-text-muted">Osoba</span>
          <select
            className="w-full min-h-[44px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={uploaderId}
            onChange={(event) => setUploaderId(event.target.value)}
          >
            <option value="">Wszystkie osoby</option>
            {filters.uploaders.map((uploader) => (
              <option key={uploader.id} value={uploader.id}>
                {uploader.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-border bg-danger-bg p-3 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            className="min-h-[44px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-text-muted">Ładowanie zdjęć…</p> : null}

      {!loading && !error && photos.length === 0 ? (
        <div className="theme-glass rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow)]">
          <p className="text-sm text-text-muted">Brak zdjęć do wyświetlenia.</p>
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((group) => {
            const newestDay = formatDay(group.newestCreatedAt);
            const oldestDay = formatDay(group.oldestCreatedAt);
            const dateLabel = newestDay === oldestDay ? newestDay : `${newestDay} – ${oldestDay}`;
            return (
              <section
                key={group.jobId}
                className="theme-glass min-w-0 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow)] sm:p-5"
              >
                <div className="mb-3 flex min-w-0 items-start gap-3 sm:mb-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-secondary text-accent">
                    <JobIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-text">
                      <Link
                        href={`/jobs/${group.jobId}`}
                        className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {formatJobGroupTitle(group.jobNumber, group.customerName)}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-text-muted sm:text-sm">
                      {formatGalleryGroupMeta({
                        dateLabel,
                        uploaderLabel: group.uploaderLabel,
                        stageLabel: group.stageLabel,
                        count: group.photos.length,
                        allLoaded: nextCursor == null,
                      })}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-6">
                  {group.photos.map((photo) => {
                    const alt = galleryPhotoAlt(photo);
                    const broken = brokenIds.includes(photo.id);
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        className="block w-full cursor-pointer overflow-hidden rounded-xl border border-border bg-bg-secondary p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        onClick={() => {
                          setDeleteError(null);
                          setSelectedId(photo.id);
                        }}
                      >
                        {broken ? (
                          <span className="flex aspect-[4/3] items-center justify-center px-2 text-center text-xs text-text-muted">
                            <span className="sr-only">{alt}. </span>
                            Podgląd niedostępny
                          </span>
                        ) : (
                          <img
                            src={photo.readUrl}
                            alt={alt}
                            width={640}
                            height={480}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            className="aspect-[4/3] h-auto w-full object-cover"
                            onError={() =>
                              setBrokenIds((current) =>
                                current.includes(photo.id) ? current : current.concat(photo.id)
                              )
                            }
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {nextCursor ? (
        <button
          type="button"
          disabled={loadingMore || loading}
          onClick={() => void loadMore()}
          className="min-h-[44px] rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-text hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        >
          {loadingMore ? "Ładowanie…" : "Pokaż starsze zdjęcia"}
        </button>
      ) : null}

      {selected ? (
        <PhotoLightbox
          photo={selected}
          canDelete={canDelete}
          hasPrevious={Boolean(previousPhoto)}
          hasNext={Boolean(nextPhoto)}
          deleting={deletingId === selected.id}
          deleteError={deleteError}
          onClose={closeLightbox}
          onPrevious={() => {
            if (previousPhoto) setSelectedId(previousPhoto.id);
          }}
          onNext={() => {
            if (nextPhoto) setSelectedId(nextPhoto.id);
          }}
          onConfirmDelete={() => void confirmDelete()}
          onDismissDeleteError={() => setDeleteError(null)}
          onReload={reloadGallery}
        />
      ) : null}
    </div>
  );
}

function GalleryHeading() {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-secondary text-accent">
        <GalleryIcon />
      </div>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-text">Galeria zdjęć</h1>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">
          Zdjęcia z realizacji zleceń, posegregowane po zleceniu, osobie i dacie.
        </p>
      </div>
    </div>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="10" r="1.4" fill="currentColor" />
      <path d="M7 16.5l3.2-3.2 2.1 2.1 2.4-2.6L19 16.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function JobIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M8 7V6.2A2.2 2.2 0 0 1 10.2 4h3.6A2.2 2.2 0 0 1 16 6.2V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect x="4" y="7" width="16" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
