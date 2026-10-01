import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import { describe, it } from "node:test";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

// tsx does not apply Next's server-only alias.
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

const STAGE_ID = "stage_supervisor_1";

describe("canUploadJobPhoto", () => {
  it("allows owner and admin, including a stage-less upload", async () => {
    const { canUploadJobPhoto } = await import("@/lib/server/jobs/photo-upload-policy");

    for (const role of ["owner", "admin"] as const) {
      assert.equal(
        canUploadJobPhoto({
          role,
          jobStageId: null,
          isStageSupervisor: false,
          isAssignedToJob: false,
        }),
        true
      );
      assert.equal(
        canUploadJobPhoto({
          role,
          jobStageId: STAGE_ID,
          isStageSupervisor: false,
          isAssignedToJob: false,
        }),
        true
      );
    }
  });

  it("denies ordinary staff", async () => {
    const { canUploadJobPhoto } = await import("@/lib/server/jobs/photo-upload-policy");
    assert.equal(
      canUploadJobPhoto({
        role: "staff",
        jobStageId: STAGE_ID,
        isStageSupervisor: false,
        isAssignedToJob: false,
      }),
      false
    );
  });

  it("denies staff who can see every job but do not supervise this stage", async () => {
    const { canUploadJobPhoto } = await import("@/lib/server/jobs/photo-upload-policy");
    assert.equal(
      canUploadJobPhoto({
        role: "staff",
        jobStageId: STAGE_ID,
        isStageSupervisor: false,
        isAssignedToJob: true,
      }),
      false
    );
  });

  it("allows assigned staff who supervise the requested stage", async () => {
    const { canUploadJobPhoto } = await import("@/lib/server/jobs/photo-upload-policy");
    assert.equal(
      canUploadJobPhoto({
        role: "staff",
        jobStageId: STAGE_ID,
        isStageSupervisor: true,
        isAssignedToJob: true,
      }),
      true
    );
  });

  it("denies a stage supervisor who is not assigned to the job", async () => {
    const { canUploadJobPhoto } = await import("@/lib/server/jobs/photo-upload-policy");
    assert.equal(
      canUploadJobPhoto({
        role: "staff",
        jobStageId: STAGE_ID,
        isStageSupervisor: true,
        isAssignedToJob: false,
      }),
      false
    );
  });

  it("denies staff supervising a different stage", async () => {
    const { canUploadJobPhoto } = await import("@/lib/server/jobs/photo-upload-policy");
    assert.equal(
      canUploadJobPhoto({
        role: "staff",
        jobStageId: "stage_other",
        isStageSupervisor: false,
        isAssignedToJob: true,
      }),
      false
    );
  });

  it("denies a stage-less staff upload even when that user supervises some stage", async () => {
    const { canUploadJobPhoto } = await import("@/lib/server/jobs/photo-upload-policy");
    assert.equal(
      canUploadJobPhoto({
        role: "staff",
        jobStageId: null,
        isStageSupervisor: true,
        isAssignedToJob: true,
      }),
      false
    );
  });

  it("does not treat an unknown role as a manager grant", async () => {
    const { canUploadJobPhoto } = await import("@/lib/server/jobs/photo-upload-policy");
    assert.equal(
      canUploadJobPhoto({
        role: "manager",
        jobStageId: STAGE_ID,
        isStageSupervisor: true,
        isAssignedToJob: true,
      }),
      false
    );
  });
});

describe("stored photo metadata", () => {
  it("caps the object at 2 MiB and accepts only JPEG", async () => {
    const { PHOTO_JPEG_CONTENT_TYPE, PHOTO_MAX_SIZE_BYTES, PHOTO_UPLOAD_URL_TTL_SECONDS, storedPhotoRejection } =
      await import("@/lib/server/jobs/photo-upload-policy");

    assert.equal(PHOTO_MAX_SIZE_BYTES, 2 * 1024 * 1024);
    assert.equal(PHOTO_JPEG_CONTENT_TYPE, "image/jpeg");
    assert.equal(PHOTO_UPLOAD_URL_TTL_SECONDS, 10 * 60);

    assert.equal(
      storedPhotoRejection({ contentType: "image/jpeg", sizeBytes: PHOTO_MAX_SIZE_BYTES }),
      null
    );
    assert.equal(
      storedPhotoRejection({ contentType: "image/jpeg; charset=binary", sizeBytes: 1 }),
      null
    );
    assert.equal(storedPhotoRejection({ contentType: "image/png", sizeBytes: 100 }), "PHOTO_CONTENT_TYPE");
    assert.equal(storedPhotoRejection({ contentType: "image/webp", sizeBytes: 100 }), "PHOTO_CONTENT_TYPE");
    assert.equal(storedPhotoRejection({ contentType: "image/gif", sizeBytes: 100 }), "PHOTO_CONTENT_TYPE");
    assert.equal(storedPhotoRejection({ contentType: "", sizeBytes: 100 }), "PHOTO_CONTENT_TYPE");
    assert.equal(storedPhotoRejection({ contentType: "image/jpeg", sizeBytes: 0 }), "PHOTO_EMPTY");
    assert.equal(storedPhotoRejection({ contentType: "image/jpeg", sizeBytes: -1 }), "PHOTO_EMPTY");
    assert.equal(
      storedPhotoRejection({ contentType: "image/jpeg", sizeBytes: PHOTO_MAX_SIZE_BYTES + 1 }),
      "PHOTO_TOO_LARGE"
    );
  });

  it("keeps only a short basename as the original filename", async () => {
    const { normalizeOriginalFilename } = await import("@/lib/server/jobs/photo-upload-policy");
    assert.equal(normalizeOriginalFilename("  C:\\Users\\site\\panel.jpg  "), "panel.jpg");
    assert.equal(normalizeOriginalFilename("../secret/panel.jpg"), "panel.jpg");
    assert.equal(normalizeOriginalFilename("panel.jpg"), "panel.jpg");
    assert.equal(normalizeOriginalFilename(""), null);
    assert.equal(normalizeOriginalFilename("."), null);
    assert.equal(normalizeOriginalFilename(".."), null);
    assert.equal(normalizeOriginalFilename("a\u0000.jpg"), null);
    assert.equal(normalizeOriginalFilename("x".repeat(121)), null);
    assert.equal(normalizeOriginalFilename(12), null);
  });
});

describe("photo upload request bodies", () => {
  it("ignores browser content type and size on finalize", async () => {
    const { parsePhotoUploadFinalizeBody } = await import("@/lib/server/jobs/photo-upload-request");
    const parsed = parsePhotoUploadFinalizeBody({
      uploadIntent: "a".repeat(40),
      objectKey: "companies/companyA/jobs/jobB/photos/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
      jobStageId: "stage1",
      originalFilename: "folder/panel.jpg",
      contentType: "image/png",
      sizeBytes: 9,
    });

    assert.equal(parsed.originalFilename, "panel.jpg");
    assert.equal(parsed.jobStageId, "stage1");
    assert.equal("contentType" in parsed, false);
    assert.equal("sizeBytes" in parsed, false);
  });
});

describe("photo upload intent", () => {
  it("round-trips a valid token and rejects expiry, tampering, and the wrong user", async () => {
    const { createPhotoObjectKey } = await import("@/lib/server/storage/photo-object-key");
    const {
      createPhotoUploadIntent,
      photoUploadIntentBinding,
      verifyPhotoUploadIntent,
    } = await import("@/lib/server/jobs/photo-upload-intent");
    const { PHOTO_UPLOAD_URL_TTL_SECONDS } = await import("@/lib/server/jobs/photo-upload-policy");

    const objectKey = createPhotoObjectKey({ companyId: "companyA", jobId: "jobB" });
    const input = {
      userId: "user_owner_1",
      companyId: "companyA",
      jobId: "jobB",
      jobStageId: "stage1",
      objectKey,
      originalFilename: "panel.jpg",
    };
    const issuedAt = Date.now();
    const token = createPhotoUploadIntent(input, issuedAt);
    const claims = verifyPhotoUploadIntent(token, issuedAt);
    assert.ok(claims);
    assert.equal(claims.objectKey, objectKey);
    assert.equal(claims.userId, input.userId);
    assert.equal(claims.originalFilename, "panel.jpg");
    assert.equal(
      photoUploadIntentBinding(claims, {
        userId: input.userId,
        companyId: input.companyId,
        jobId: input.jobId,
        jobStageId: input.jobStageId,
        objectKey,
        originalFilename: "panel.jpg",
      }),
      "ok"
    );

    assert.equal(
      photoUploadIntentBinding(claims, {
        userId: "other_user",
        companyId: input.companyId,
        jobId: input.jobId,
        jobStageId: input.jobStageId,
        objectKey,
        originalFilename: "panel.jpg",
      }),
      "wrong_user"
    );

    const expiredAt = issuedAt - (PHOTO_UPLOAD_URL_TTL_SECONDS + 5) * 1000;
    const expired = createPhotoUploadIntent(input, expiredAt);
    assert.equal(verifyPhotoUploadIntent(expired, Date.now()), null);
    assert.ok(verifyPhotoUploadIntent(expired, expiredAt));

    const inner = Buffer.from(token, "base64url").toString("utf8");
    const dot = inner.indexOf(".");
    const payloadJson = Buffer.from(inner.slice(0, dot), "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { objectKey: string };
    const alteredKey = objectKey.endsWith("0123456789abcdef0123456789abcdef.jpg")
      ? objectKey.replace(
          "0123456789abcdef0123456789abcdef",
          "fedcba9876543210fedcba9876543210"
        )
      : objectKey.replace(/[a-f0-9]{32}/, "0123456789abcdef0123456789abcdef");
    assert.notEqual(alteredKey, objectKey);
    payload.objectKey = alteredKey;
    const tamperedJson = JSON.stringify(payload);
    const tampered = Buffer.from(
      `${Buffer.from(tamperedJson, "utf8").toString("base64url")}.${inner.slice(dot + 1)}`,
      "utf8"
    ).toString("base64url");
    assert.equal(verifyPhotoUploadIntent(tampered, issuedAt), null);

    const rawMac = createHmac("sha256", process.env.SESSION_SECRET!)
      .update(payloadJson, "utf8")
      .digest("base64url");
    const unsignedAsSession = Buffer.from(
      `${inner.slice(0, dot)}.${rawMac}`,
      "utf8"
    ).toString("base64url");
    assert.equal(verifyPhotoUploadIntent(unsignedAsSession, issuedAt), null);
    assert.equal(verifyPhotoUploadIntent(`${token}x`, issuedAt), null);
  });

  it("refuses to sign a key outside the authorized company and job", async () => {
    const { createPhotoObjectKey } = await import("@/lib/server/storage/photo-object-key");
    const { createPhotoUploadIntent } = await import("@/lib/server/jobs/photo-upload-intent");
    const objectKey = createPhotoObjectKey({ companyId: "companyA", jobId: "jobB" });
    assert.throws(
      () =>
        createPhotoUploadIntent({
          userId: "user_owner_1",
          companyId: "companyOTHER",
          jobId: "jobB",
          jobStageId: null,
          objectKey,
          originalFilename: null,
        }),
      /INVALID_PHOTO_UPLOAD/
    );
  });
});

describe("upload protocol source", () => {
  it("keeps blob calls in the adapter and re-checks authorization before metadata", async () => {
    const service = await readFile("lib/server/jobs/photo-upload.ts", "utf8");
    const presign = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/photos/upload-url/route.ts",
      "utf8"
    );
    const finalize = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/photos/finalize/route.ts",
      "utf8"
    );
    const adapter = await readFile("lib/server/storage/vercel-photo-storage.ts", "utf8");

    assert.match(service, /requireJobPhotoAccessForUser/);
    assert.match(service, /requireCompanyJobStage/);
    assert.match(service, /canUploadJobPhoto/);
    assert.match(service, /verifyPhotoUploadIntent/);
    assert.doesNotMatch(service, /@vercel\/blob/);
    assert.doesNotMatch(service, /createReadUrl/);
    assert.ok(service.indexOf("verifyPhotoUploadIntent") < service.indexOf(".head("));
    assert.ok(service.indexOf(".head(") < service.indexOf("jobPhoto.create"));
    assert.ok(service.indexOf("findUnique") < service.indexOf(".head("));

    for (const route of [presign, finalize]) {
      assert.match(route, /export async function POST/);
      assert.doesNotMatch(route, /export async function GET/);
      assert.doesNotMatch(route, /export async function DELETE/);
      assert.doesNotMatch(route, /@vercel\/blob/);
    }

    assert.match(adapter, /allowedContentTypes/);
    assert.match(adapter, /maximumSizeInBytes/);
    assert.match(adapter, /head: headObject/);
    assert.doesNotMatch(presign, /contentType:\s*body/);
  });
});
