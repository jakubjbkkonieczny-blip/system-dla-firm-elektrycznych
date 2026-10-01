import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import { describe, it } from "node:test";

const nodeRequire = createRequire(import.meta.url);
const moduleResolver = Module as unknown as {
  _resolveFilename: (
    request: string,
    parent: NodeJS.Module | null | undefined,
    isMain: boolean,
    options?: object
  ) => string;
};
const resolveFilename = moduleResolver._resolveFilename;
moduleResolver._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return nodeRequire.resolve("next/dist/compiled/server-only/empty.js");
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};

import { canMemberSeeJob, memberSeesAllCompanyJobs } from "@/lib/server/jobs/job-visibility";
import {
  clampGalleryLimit,
  decodePhotoCursor,
  encodePhotoCursor,
  GALLERY_PAGE_SIZE,
  galleryJobPhotoWhere,
  legacyStagePhotoUrls,
  PHOTO_READ_URL_TTL_SECONDS,
  toGalleryPhotoDto,
  toJobPhotoReadView,
  type GalleryPhotoRecord,
} from "@/lib/server/jobs/job-photo-query";

const companyId = "company_a";
const userId = "user_a";

describe("memberSeesAllCompanyJobs matches canMemberSeeJob", () => {
  const members = [
    { role: "owner", scope: "assigned_only" },
    { role: "admin", scope: null },
    { role: "staff", scope: "all" },
    { role: "staff", scope: null },
    { role: "staff", scope: "" },
    { role: "staff", scope: "assigned_only" },
    { role: "staff", scope: "custom" },
    { role: "staff", scope: "unknown" },
    { role: "", scope: null },
  ];

  for (const member of members) {
    for (const assigned of [false, true]) {
      it(`role=${member.role || "(empty)"} scope=${String(member.scope)} assigned=${assigned}`, () => {
        const expected = canMemberSeeJob(member, userId, assigned ? [userId] : []);
        const actual = memberSeesAllCompanyJobs(member) || assigned;
        assert.equal(actual, expected);
      });
    }
  }
});

describe("galleryJobPhotoWhere", () => {
  it("lets owner, admin, and staff scope all/null see every non-deleted company job", () => {
    for (const member of [
      { role: "owner", scope: "assigned_only" },
      { role: "admin", scope: "custom" },
      { role: "staff", scope: "all" },
      { role: "staff", scope: null },
      { role: "staff", scope: "" },
    ]) {
      const where = galleryJobPhotoWhere({ companyId, userId, member });
      assert.equal(where.companyId, companyId);
      assert.deepEqual(where.job, { companyId, deletedAt: null });
    }
  });

  it("limits assigned_only, custom, and unknown staff to their assignments", () => {
    for (const scope of ["assigned_only", "custom", "unknown"]) {
      const where = galleryJobPhotoWhere({
        companyId,
        userId,
        member: { role: "staff", scope },
      });
      assert.equal(where.companyId, companyId);
      assert.deepEqual(where.job, {
        companyId,
        deletedAt: null,
        assignments: { some: { companyId, userId } },
      });
    }
  });

  it("keeps company and visibility constraints when a job filter is set", () => {
    const where = galleryJobPhotoWhere({
      companyId,
      userId,
      member: { role: "staff", scope: "assigned_only" },
      jobId: "job_hidden",
      uploadedByUserId: "user_other",
    });
    assert.equal(where.companyId, companyId);
    assert.equal(where.jobId, "job_hidden");
    assert.equal(where.uploadedByUserId, "user_other");
    const job = where.job as { deletedAt: null; assignments: { some: { userId: string } } };
    assert.equal(job.deletedAt, null);
    assert.equal(job.assignments.some.userId, userId);
  });

  it("applies the cursor inside the visibility filter", () => {
    const createdAt = new Date("2026-10-01T12:00:00.000Z");
    const where = galleryJobPhotoWhere({
      companyId,
      userId,
      member: { role: "staff", scope: "custom" },
      cursor: { createdAt, id: "photo_2" },
    });
    assert.ok(Array.isArray(where.AND));
    const [visibility, cursor] = where.AND as [
      { companyId: string; job: { assignments: { some: { userId: string } } } },
      { OR: unknown[] },
    ];
    assert.equal(visibility.companyId, companyId);
    assert.equal(visibility.job.assignments.some.userId, userId);
    assert.equal((cursor.OR as unknown[]).length, 2);
  });
});

describe("gallery cursor and page size", () => {
  it("round-trips a createdAt + id cursor and rejects forged values", () => {
    const cursor = { createdAt: new Date("2026-10-01T18:04:05.123Z"), id: "ckphoto123" };
    const encoded = encodePhotoCursor(cursor);
    assert.deepEqual(decodePhotoCursor(encoded), cursor);
    assert.equal(decodePhotoCursor("companies/a/jobs/b/photos/secret.jpg"), null);
    assert.equal(decodePhotoCursor(""), null);
    assert.equal(clampGalleryLimit(null), GALLERY_PAGE_SIZE);
    assert.equal(GALLERY_PAGE_SIZE, 24);
    assert.equal(clampGalleryLimit("30"), 30);
    assert.equal(clampGalleryLimit("500"), 30);
    assert.equal(clampGalleryLimit("0"), 1);
  });

  it("uses a short read TTL below the storage maximum", async () => {
    const { PHOTO_SIGNED_URL_MAX_TTL_SECONDS } = await import("@/lib/server/storage/photo-storage");
    assert.equal(PHOTO_READ_URL_TTL_SECONDS, 10 * 60);
    assert.ok(PHOTO_READ_URL_TTL_SECONDS >= 5 * 60);
    assert.ok(PHOTO_READ_URL_TTL_SECONDS <= 15 * 60);
    assert.ok(PHOTO_READ_URL_TTL_SECONDS < PHOTO_SIGNED_URL_MAX_TTL_SECONDS);
  });
});

describe("gallery DTO", () => {
  const createdAt = new Date("2026-10-01T18:04:05.123Z");

  function record(overrides: Partial<GalleryPhotoRecord> = {}): GalleryPhotoRecord {
    return {
      id: "photo_1",
      createdAt,
      originalFilename: null,
      contentType: "image/jpeg",
      objectKey: "companies/company_a/jobs/job_1/photos/secret.jpg",
      job: { id: "job_1", jobNumber: 12, customerName: "Jan Kowalski" },
      jobStage: null,
      uploadedBy: { id: "user_b", displayName: "Anna", email: "anna@example.com" },
      ...overrides,
    };
  }

  it("omits objectKey and keeps a null stage and filename", () => {
    const dto = toGalleryPhotoDto(record(), {
      readUrl: "https://signed.example/read",
      expiresAt: "2026-10-01T18:14:05.123Z",
    });
    assert.equal("objectKey" in dto, false);
    assert.equal(dto.stage, null);
    assert.equal(dto.originalFilename, null);
    assert.equal(dto.job.jobNumber, 12);
    assert.equal(dto.uploadedBy.displayName, "Anna");
    assert.doesNotMatch(JSON.stringify(dto), /secret\.jpg/);
    assert.equal(dto.readUrl, "https://signed.example/read");
  });

  it("uses the stage relation when jobStageId still points at a stage", () => {
    const dto = toGalleryPhotoDto(
      record({ jobStage: { id: "stage_1", name: "Montaż" } }),
      { readUrl: "https://signed.example/read", expiresAt: "2026-10-01T18:14:05.123Z" }
    );
    assert.deepEqual(dto.stage, { id: "stage_1", name: "Montaż" });
  });

  it("falls back when the uploader name is missing", () => {
    const dto = toGalleryPhotoDto(
      record({ uploadedBy: { id: "user_b", displayName: "  ", email: "anna@example.com" } }),
      { readUrl: "https://signed.example/read", expiresAt: "2026-10-01T18:14:05.123Z" }
    );
    assert.equal(dto.uploadedBy.displayName, "anna@example.com");
    const view = toJobPhotoReadView(
      { id: "photo_1", createdAt, originalFilename: null },
      { readUrl: "https://signed.example/read", expiresAt: "2026-10-01T18:14:05.123Z" }
    );
    assert.equal("objectKey" in view, false);
    assert.equal(view.originalFilename, null);
  });
});

describe("legacy JobStagePhoto urls", () => {
  it("keeps only http(s) urls and drops object keys", () => {
    assert.deepEqual(
      legacyStagePhotoUrls([
        "companies/a/jobs/b/photos/abc.jpg",
        " https://cdn.example/old.jpg ",
        "javascript:alert(1)",
        "",
      ]),
      ["https://cdn.example/old.jpg"]
    );
  });
});

describe("photo read authorization order", () => {
  it("filters in the query before take and signs only those rows", async () => {
    const source = await readFile(new URL("../job-photo-read.ts", import.meta.url), "utf8");
    const listAt = source.indexOf("export async function listCompanyGalleryPhotos");
    const decodeAt = source.indexOf("decodePhotoCursor", listAt);
    const whereAt = source.indexOf("galleryJobPhotoWhere", listAt);
    const findAt = source.indexOf("jobPhoto.findMany", listAt);
    const signAt = source.indexOf("signAuthorizedPhotoReads", listAt);
    assert.ok(listAt >= 0);
    assert.ok(decodeAt < whereAt);
    assert.ok(whereAt < findAt);
    assert.ok(findAt < signAt);
    assert.match(source.slice(findAt, signAt), /take: input\.limit \+ 1/);
    assert.doesNotMatch(source, /@vercel\/blob/);
    assert.doesNotMatch(source, /jobStagePhoto\.(create|createMany|update|upsert)/);

    const displayAt = source.indexOf("export async function loadJobPhotoDisplay");
    const displayFind = source.indexOf("jobPhoto.findMany", displayAt);
    const displaySign = source.indexOf("signAuthorizedPhotoReads", displayAt);
    assert.ok(displayFind < displaySign);
    assert.match(source.slice(displayFind, displaySign), /take: JOB_PHOTO_DISPLAY_LIMIT/);
    assert.match(source, /jobStageId && row\.jobStage/);
  });

  it("does not import the blob SDK outside the Vercel adapter", async () => {
    const files = [
      "../job-photo-query.ts",
      "../job-photo-read.ts",
      "../job-stage-dto.ts",
      "../../../../app/api/companies/[companyId]/photos/route.ts",
    ];
    for (const file of files) {
      const source = await readFile(new URL(file, import.meta.url), "utf8");
      assert.doesNotMatch(source, /@vercel\/blob/);
      assert.doesNotMatch(source, /BLOB_READ_WRITE_TOKEN/);
      assert.doesNotMatch(source, /jobStagePhoto/);
    }

    const route = await readFile(
      new URL("../../../../app/api/companies/[companyId]/photos/route.ts", import.meta.url),
      "utf8"
    );
    const memberAt = route.indexOf("requireActiveMember");
    const listAt = route.indexOf("listCompanyGalleryPhotos");
    assert.ok(memberAt >= 0 && memberAt < listAt);
    assert.doesNotMatch(route, /objectKey/);
  });
});
