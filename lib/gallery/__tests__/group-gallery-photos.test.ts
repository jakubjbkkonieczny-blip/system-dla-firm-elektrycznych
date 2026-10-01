import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  formatGalleryGroupMeta,
  formatJobGroupTitle,
  formatLoadedPhotoCount,
  galleryPhotoAlt,
  groupGalleryPhotosByJob,
  type GalleryPhoto,
} from "@/lib/gallery/gallery-photo";

function photo(overrides: Partial<GalleryPhoto> & Pick<GalleryPhoto, "id" | "createdAt">): GalleryPhoto {
  return {
    originalFilename: null,
    contentType: "image/jpeg",
    readUrl: "https://signed.example/read",
    readUrlExpiresAt: "2026-10-01T18:14:05.123Z",
    job: { id: "job_a", jobNumber: 12, customerName: "Villa Park" },
    stage: { id: "stage_1", name: "Montaż" },
    uploadedBy: { id: "user_a", displayName: "Jakub Konieczny" },
    ...overrides,
  };
}

describe("groupGalleryPhotosByJob", () => {
  it("groups by job in first-seen order and keeps newest-first photos", () => {
    const groups = groupGalleryPhotosByJob([
      photo({ id: "p1", createdAt: "2026-09-12T10:00:00.000Z", job: { id: "job_a", jobNumber: 12, customerName: "Villa Park" } }),
      photo({
        id: "p2",
        createdAt: "2026-09-11T10:00:00.000Z",
        job: { id: "job_b", jobNumber: 8, customerName: "Anna Nowak" },
        uploadedBy: { id: "user_b", displayName: "Ewa" },
        stage: null,
      }),
      photo({ id: "p3", createdAt: "2026-09-10T10:00:00.000Z", job: { id: "job_a", jobNumber: 12, customerName: "Villa Park" } }),
    ]);

    assert.deepEqual(
      groups.map((group) => group.jobId),
      ["job_a", "job_b"]
    );
    assert.deepEqual(
      groups[0]?.photos.map((item) => item.id),
      ["p1", "p3"]
    );
    assert.equal(groups[0]?.photos.length, 2);
    assert.equal(groups[0]?.uploaderLabel, "Jakub Konieczny");
    assert.equal(groups[0]?.stageLabel, "Montaż");
    assert.equal(groups[1]?.uploaderLabel, "Ewa");
    assert.equal(groups[1]?.stageLabel, null);
  });

  it("does not invent a single uploader or stage when the loaded photos differ", () => {
    const groups = groupGalleryPhotosByJob([
      photo({ id: "p1", createdAt: "2026-09-12T10:00:00.000Z" }),
      photo({
        id: "p2",
        createdAt: "2026-09-01T10:00:00.000Z",
        uploadedBy: { id: "user_b", displayName: "Ewa" },
        stage: { id: "stage_2", name: "Pomiary" },
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.uploaderLabel, null);
    assert.equal(groups[0]?.stageLabel, null);
    assert.equal(groups[0]?.newestCreatedAt, "2026-09-12T10:00:00.000Z");
    assert.equal(groups[0]?.oldestCreatedAt, "2026-09-01T10:00:00.000Z");
  });
});

describe("gallery labels", () => {
  it("pluralizes loaded counts without calling a partial page the full total", () => {
    assert.equal(formatLoadedPhotoCount(1, true), "1 zdjęcie");
    assert.equal(formatLoadedPhotoCount(2, true), "2 zdjęcia");
    assert.equal(formatLoadedPhotoCount(5, true), "5 zdjęć");
    assert.equal(formatLoadedPhotoCount(12, true), "12 zdjęć");
    assert.equal(formatLoadedPhotoCount(22, true), "22 zdjęcia");
    assert.equal(formatLoadedPhotoCount(1, false), "1 zdjęcie wczytane");
    assert.equal(formatLoadedPhotoCount(4, false), "4 zdjęcia wczytane");
    assert.equal(formatLoadedPhotoCount(5, false), "5 zdjęć wczytanych");
    assert.equal(formatLoadedPhotoCount(14, false), "14 zdjęć wczytanych");
  });

  it("uses the job number and customer, and describes the photo", () => {
    assert.equal(formatJobGroupTitle(12, " Villa Park "), "Zlecenie nr 12 — Villa Park");
    assert.equal(formatJobGroupTitle(12, "  "), "Zlecenie nr 12");
    assert.equal(
      galleryPhotoAlt({
        job: { jobNumber: 12, customerName: "Villa Park" },
        stage: { name: "Montaż" },
      }),
      "Zdjęcie zlecenia nr 12, Villa Park, etap Montaż"
    );
    assert.equal(
      formatGalleryGroupMeta({
        dateLabel: "12 września 2026",
        uploaderLabel: "Jakub Konieczny",
        stageLabel: "Montaż",
        count: 4,
        allLoaded: false,
      }),
      "12 września 2026 · Montaż · Jakub Konieczny · 4 zdjęcia wczytane"
    );
  });
});

describe("gallery ui source", () => {
  it("opens an in-app lightbox and does not send the browser to the blob url", async () => {
    const gallery = await readFile(
      new URL("../../../components/gallery/PhotoGallery.tsx", import.meta.url),
      "utf8"
    );
    const lightbox = await readFile(
      new URL("../../../components/gallery/PhotoLightbox.tsx", import.meta.url),
      "utf8"
    );

    for (const source of [gallery, lightbox]) {
      assert.doesNotMatch(source, /target="_blank"/);
      assert.doesNotMatch(source, /window\.open/);
      assert.doesNotMatch(source, /window\.confirm/);
      assert.doesNotMatch(source, /@vercel\/blob/);
      assert.doesNotMatch(source, /objectKey/);
      assert.doesNotMatch(source, /Dodaj zdjęcia/);
    }

    assert.match(lightbox, /aria-modal="true"/);
    assert.match(lightbox, /Usunąć to zdjęcie\?/);
    assert.match(lightbox, /canDelete \?/);
    assert.match(lightbox, /object-contain/);
    assert.match(gallery, /method: "DELETE"/);
    assert.match(gallery, /groupGalleryPhotosByJob/);
    assert.doesNotMatch(gallery, /body:\s*JSON\.stringify/);
  });
});
