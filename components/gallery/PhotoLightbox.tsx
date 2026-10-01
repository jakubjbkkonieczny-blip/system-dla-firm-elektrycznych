"use client";

import { galleryPhotoAlt, type GalleryPhoto } from "@/lib/gallery/gallery-photo";
import { useEffect, useId, useRef, useState } from "react";

const dateTimeFormat = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormat.format(date);
}

function lockPageScroll(): () => void {
  const previousBody = document.body.style.overflow;
  const previousHtml = document.documentElement.style.overflow;
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";

  const scroller = document.querySelector("[data-app-scroll]");
  const previousScroller = scroller instanceof HTMLElement ? scroller.style.overflow : "";
  if (scroller instanceof HTMLElement) scroller.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = previousBody;
    document.documentElement.style.overflow = previousHtml;
    if (scroller instanceof HTMLElement) scroller.style.overflow = previousScroller;
  };
}

export function PhotoLightbox({
  photo,
  canDelete,
  hasPrevious,
  hasNext,
  deleting,
  deleteError,
  onClose,
  onPrevious,
  onNext,
  onConfirmDelete,
  onDismissDeleteError,
  onReload,
}: {
  photo: GalleryPhoto;
  canDelete: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  deleting: boolean;
  deleteError: string | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onConfirmDelete: () => void;
  onDismissDeleteError: () => void;
  onReload: () => void;
}) {
  const titleId = useId();
  const confirmTitleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirmPhotoId, setConfirmPhotoId] = useState<string | null>(null);
  const [failedPhotoId, setFailedPhotoId] = useState<string | null>(null);
  const confirming = confirmPhotoId === photo.id;
  const imageFailed = failedPhotoId === photo.id;

  const stageLabel = photo.stage?.name.trim() || "Bez etapu";
  const title = photo.job.customerName.trim()
    ? `Zlecenie nr ${photo.job.jobNumber} — ${photo.job.customerName.trim()}`
    : `Zlecenie nr ${photo.job.jobNumber}`;
  const details = [stageLabel, photo.uploadedBy.displayName, formatCreatedAt(photo.createdAt)]
    .filter((part) => part.trim().length > 0)
    .join(" · ");
  const showFooter = hasPrevious || hasNext || canDelete;

  function closeConfirm() {
    if (deleting) return;
    setConfirmPhotoId(null);
    onDismissDeleteError();
  }

  useEffect(() => {
    closeRef.current?.focus();
    return lockPageScroll();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (deleting) return;
        if (confirming) {
          closeConfirm();
          return;
        }
        onClose();
        return;
      }
      if (confirming || deleting) return;
      if (event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        onNext();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming, deleting, hasNext, hasPrevious, onClose, onDismissDeleteError, onNext, onPrevious]);

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-black/80"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={confirming}
      >
        <div
          className="flex items-start gap-3 border-b border-border bg-card px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4"
        >
          <div className="min-w-0 flex-1 py-1">
            <p id={titleId} className="truncate text-sm font-semibold text-text">
              {title}
            </p>
            <p className="truncate text-xs text-text-muted">{details}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onClose}
            aria-label="Zamknij podgląd"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            className="absolute inset-0 flex items-center justify-center px-3 py-3 sm:px-8"
            onClick={() => {
              if (!deleting && !confirming) onClose();
            }}
          >
          {imageFailed ? (
            <div
              className="max-w-sm rounded-2xl border border-border bg-card p-5 text-center shadow-[var(--shadow)]"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-sm font-medium text-text">Nie udało się wyświetlić zdjęcia.</p>
              <p className="mt-1 text-sm text-text-muted">Odśwież galerię i spróbuj ponownie.</p>
              <button
                type="button"
                className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-text hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={onReload}
              >
                Odśwież galerię
              </button>
            </div>
          ) : (
            <img
              src={photo.readUrl}
              alt={galleryPhotoAlt(photo)}
              className="max-h-full max-w-full object-contain"
              draggable={false}
              onClick={(event) => event.stopPropagation()}
              onError={() => setFailedPhotoId(photo.id)}
            />
          )}
          </div>
        </div>

        {showFooter ? (
          <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-3 py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="flex gap-2">
              {hasPrevious ? (
                <button
                  type="button"
                  className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card px-3 text-text hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={onPrevious}
                  aria-label="Poprzednie zdjęcie"
                >
                  <ChevronIcon direction="left" />
                </button>
              ) : null}
              {hasNext ? (
                <button
                  type="button"
                  className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card px-3 text-text hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={onNext}
                  aria-label="Następne zdjęcie"
                >
                  <ChevronIcon direction="right" />
                </button>
              ) : null}
            </div>
            {canDelete ? (
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-danger-border bg-danger-bg px-4 text-sm font-medium text-danger hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => {
                  onDismissDeleteError();
                  setConfirmPhotoId(photo.id);
                }}
              >
                Usuń zdjęcie
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {confirming ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => {
            closeConfirm();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 shadow-[var(--shadow)] sm:rounded-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={confirmTitleId} className="text-lg font-semibold text-text">
              Usunąć to zdjęcie?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Zdjęcie zostanie usunięte z VectorWork. Tej operacji nie można cofnąć.
            </p>
            {deleteError ? (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-danger-border bg-danger-bg p-3 text-sm text-danger"
              >
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-card px-4 text-sm text-text hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
                onClick={closeConfirm}
                disabled={deleting}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-danger-border bg-danger-bg px-4 text-sm font-medium text-danger hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
                onClick={onConfirmDelete}
                disabled={deleting}
                aria-busy={deleting}
              >
                {deleting ? "Usuwanie…" : "Usuń zdjęcie"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  const path = direction === "left" ? "M14.5 6.5L9 12l5.5 5.5" : "M9.5 6.5L15 12l-5.5 5.5";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
