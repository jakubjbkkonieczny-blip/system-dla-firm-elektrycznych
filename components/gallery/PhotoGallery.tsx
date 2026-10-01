"use client";

import { apiFetch } from "@/lib/api";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import Link from "next/link";
import { useEffect, useState } from "react";

type GalleryPhoto = {
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

type GalleryFilters = {
  jobs: { id: string; jobNumber: number; customerName: string }[];
  uploaders: { id: string; displayName: string }[];
};

type GalleryResponse = {
  photos?: GalleryPhoto[];
  nextCursor?: string | null;
  filters?: GalleryFilters;
};

const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormat.format(date);
}

function galleryErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "NOT_MEMBER" || code === "FORBIDDEN" || code === "Unauthorized") {
    return "Brak dostępu do galerii.";
  }
  return "Nie udało się wczytać zdjęć. Spróbuj ponownie.";
}

export function PhotoGallery() {
  const companyId = useActiveCompanyId();
  return <PhotoGalleryView key={companyId || "none"} companyId={companyId} />;
}

function PhotoGalleryView({ companyId }: { companyId: string }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<GalleryFilters>({ jobs: [], uploaders: [] });
  const [jobId, setJobId] = useState("");
  const [uploaderId, setUploaderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setPhotos([]);
      setNextCursor(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setPhotos([]);
    setNextCursor(null);
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams();
    if (jobId) qs.set("jobId", jobId);
    if (uploaderId) qs.set("uploadedByUserId", uploaderId);
    const query = qs.toString();

    apiFetch(`/api/companies/${companyId}/photos${query ? `?${query}` : ""}`)
      .then((data: GalleryResponse) => {
        if (cancelled) return;
        setPhotos(Array.isArray(data.photos) ? data.photos : []);
        setNextCursor(data.nextCursor ?? null);
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
        setError(galleryErrorMessage(loadError));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, jobId, uploaderId, reloadKey]);

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
    } catch (loadError: unknown) {
      setError(galleryErrorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  }

  if (!companyId) {
    return (
      <div className="w-full max-w-full min-w-0">
        <h1 className="text-xl font-semibold text-text mb-2">Galeria zdjęć</h1>
        <p className="text-sm text-text-muted">Wybierz firmę, aby zobaczyć galerię.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Galeria zdjęć</h1>
        <p className="text-sm text-text-muted mt-1">Zdjęcia z widocznych zleceń, od najnowszych.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1 min-w-0">
          <span className="text-xs text-text-muted">Zlecenie</span>
          <select
            className="w-full min-h-[44px] rounded-xl border border-border bg-card text-text px-3 py-2 text-sm"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          >
            <option value="">Wszystkie zlecenia</option>
            {filters.jobs.map((job) => (
              <option key={job.id} value={job.id}>
                Zlecenie nr {job.jobNumber} · {job.customerName}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 min-w-0">
          <span className="text-xs text-text-muted">Osoba</span>
          <select
            className="w-full min-h-[44px] rounded-xl border border-border bg-card text-text px-3 py-2 text-sm"
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
        <div className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            className="min-h-[44px] px-3 py-2 rounded-xl border border-border bg-card text-text text-sm"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-text-muted">Ładowanie zdjęć…</p> : null}

      {!loading && !error && photos.length === 0 ? (
        <div className="theme-glass border border-border rounded-2xl bg-card p-6">
          <p className="text-sm text-text-muted">Brak zdjęć do wyświetlenia.</p>
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo) => {
            const filename = photo.originalFilename?.trim() || "";
            const alt = filename || "Zdjęcie zlecenia";
            return (
              <article
                key={photo.id}
                className="theme-glass border border-border rounded-2xl bg-card overflow-hidden min-w-0 flex flex-col"
              >
                <a href={photo.readUrl} target="_blank" rel="noreferrer" className="block bg-bg-secondary">
                  <img
                    src={photo.readUrl}
                    alt={alt}
                    width={640}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-[4/3] object-cover"
                  />
                </a>
                <div className="p-3 space-y-1 min-w-0">
                  <Link
                    href={`/jobs/${photo.job.id}`}
                    className="block text-sm font-medium text-text truncate hover:underline"
                  >
                    Zlecenie nr {photo.job.jobNumber}
                  </Link>
                  <p className="text-sm text-text truncate">{photo.job.customerName || "—"}</p>
                  <p className="text-xs text-text-muted truncate">
                    {photo.stage?.name ? `Etap: ${photo.stage.name}` : "Bez etapu"}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {formatCreatedAt(photo.createdAt)} · {photo.uploadedBy.displayName || "Nieznany użytkownik"}
                  </p>
                  {filename ? (
                    <p className="text-xs text-text-muted truncate">{filename}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {nextCursor ? (
        <button
          type="button"
          disabled={loadingMore || loading}
          onClick={() => void loadMore()}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-border bg-card text-text text-sm font-medium hover:bg-card-hover disabled:opacity-60"
        >
          {loadingMore ? "Ładowanie…" : "Pokaż starsze zdjęcia"}
        </button>
      ) : null}
    </div>
  );
}
