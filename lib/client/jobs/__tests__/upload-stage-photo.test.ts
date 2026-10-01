import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { JobPhotoClientError, stageFinishErrorMessage } from "@/lib/client/images/job-photo-messages";
import { PHOTO_JPEG_CONTENT_TYPE, PHOTO_MAX_SIZE_BYTES } from "@/lib/jobs/photo-limits";
import {
  buildFinalizeBody,
  buildJpegPutRequest,
  buildPresignBody,
  parsePresignPayload,
  uploadOneStagePhoto,
  uploadStagePhotoSequence,
  type PresignedStagePhoto,
} from "@/lib/client/jobs/upload-stage-photo";

const OBJECT_KEY = "companies/co/jobs/job/photos/0123456789abcdef0123456789abcdef.jpg";
const UPLOAD_URL = "https://blob.example/private/put?token=secret";
const INTENT = "opaque-upload-intent-value-0123456789";

function presign(overrides: Partial<PresignedStagePhoto> = {}): PresignedStagePhoto {
  return {
    objectKey: OBJECT_KEY,
    uploadUrl: UPLOAD_URL,
    uploadIntent: INTENT,
    jobStageId: "stage-1",
    originalFilename: "kuchnia.jpg",
    contentType: PHOTO_JPEG_CONTENT_TYPE,
    maximumSizeBytes: PHOTO_MAX_SIZE_BYTES,
    ...overrides,
  };
}

function imageFile(name: string): File {
  return new File([Uint8Array.from([1, 2, 3])], name, { type: "image/jpeg" });
}

describe("presign and finalize bodies", () => {
  it("sends the original filename and uses the server object key on finalize", () => {
    assert.deepEqual(buildPresignBody("stage-1", "kuchnia.jpg"), {
      jobStageId: "stage-1",
      originalFilename: "kuchnia.jpg",
    });

    const body = buildFinalizeBody(presign({ originalFilename: "kuchnia.jpg" }));
    assert.deepEqual(Object.keys(body).sort(), [
      "jobStageId",
      "objectKey",
      "originalFilename",
      "uploadIntent",
    ]);
    assert.equal(body.objectKey, OBJECT_KEY);
    assert.equal(body.uploadIntent, INTENT);
    assert.equal("sizeBytes" in body, false);
    assert.equal("contentType" in body, false);
  });

  it("accepts a presign payload and rejects a non-HTTPS upload URL", () => {
    assert.equal(parsePresignPayload(presign())?.objectKey, OBJECT_KEY);
    assert.equal(parsePresignPayload({ ...presign(), uploadUrl: "http://blob.example/put" }), null);
    assert.equal(parsePresignPayload({ ...presign(), contentType: "image/png" }), null);
  });
});

describe("direct JPEG PUT", () => {
  it("omits credentials and does not send an authorization header", () => {
    const jpeg = new Blob([Uint8Array.from([1])], { type: PHOTO_JPEG_CONTENT_TYPE });
    const request = buildJpegPutRequest(UPLOAD_URL, jpeg);
    const headers = new Headers(request.init.headers);
    assert.equal(request.init.method, "PUT");
    assert.equal(request.init.credentials, "omit");
    assert.equal(headers.get("Content-Type"), "image/jpeg");
    assert.equal(headers.has("Authorization"), false);
    assert.equal(request.init.body, jpeg);
  });
});

describe("uploadOneStagePhoto", () => {
  it("presigns, PUTs, then finalizes with the server fields", async () => {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const puts: string[] = [];
    const file = imageFile("Kuchnia.HEIC.jpg");
    const jpeg = new Blob([Uint8Array.from([9, 9])], { type: PHOTO_JPEG_CONTENT_TYPE });

    await uploadOneStagePhoto(
      { companyId: "co", jobId: "job", jobStageId: "stage-1", file },
      {
        prepare: async () => jpeg,
        postJson: async (path, body) => {
          calls.push({ path, body });
          if (path.endsWith("/upload-url")) return { ...presign(), expiresAt: "2026-01-01T00:00:00.000Z" };
          return { photo: { id: "p1" } };
        },
        putJpeg: async (request) => {
          puts.push(request.url);
          assert.equal(request.init.body, jpeg);
          return true;
        },
      }
    );

    assert.deepEqual(puts, [UPLOAD_URL]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].path, "/api/companies/co/jobs/job/photos/upload-url");
    assert.deepEqual(calls[0].body, { jobStageId: "stage-1", originalFilename: "Kuchnia.HEIC.jpg" });
    assert.equal(calls[1].path, "/api/companies/co/jobs/job/photos/finalize");
    assert.equal(calls[1].body.objectKey, OBJECT_KEY);
    assert.equal(calls[1].body.originalFilename, "kuchnia.jpg");
    assert.equal(calls[1].body.objectKey === file.name, false);
  });

  it("does not PUT when presign fails", async () => {
    let puts = 0;
    await assert.rejects(
      () =>
        uploadOneStagePhoto(
          { companyId: "co", jobId: "job", jobStageId: "stage-1", file: imageFile("a.jpg") },
          {
            prepare: async () => new Blob([Uint8Array.from([1])], { type: "image/jpeg" }),
            postJson: async () => {
              throw new Error("FORBIDDEN");
            },
            putJpeg: async () => {
              puts += 1;
              return true;
            },
          }
        ),
      (error: unknown) => {
        assert.ok(error instanceof JobPhotoClientError);
        assert.match(error.message, /Nie udało się przesłać zdjęcia/);
        assert.doesNotMatch(error.message, /FORBIDDEN/);
        return true;
      }
    );
    assert.equal(puts, 0);
  });

  it("does not finalize when PUT fails", async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        uploadOneStagePhoto(
          { companyId: "co", jobId: "job", jobStageId: "stage-1", file: imageFile("a.jpg") },
          {
            prepare: async () => new Blob([Uint8Array.from([1])], { type: "image/jpeg" }),
            postJson: async (path) => {
              calls.push(path);
              return presign();
            },
            putJpeg: async () => false,
          }
        ),
      (error: unknown) => error instanceof JobPhotoClientError
    );
    assert.deepEqual(calls, ["/api/companies/co/jobs/job/photos/upload-url"]);
  });

  it("does not upload a prepared blob over the server maximum", async () => {
    let puts = 0;
    const oversized = new Blob([new Uint8Array(PHOTO_MAX_SIZE_BYTES + 1)], { type: "image/jpeg" });
    await assert.rejects(
      () =>
        uploadOneStagePhoto(
          { companyId: "co", jobId: "job", jobStageId: "stage-1", file: imageFile("a.jpg") },
          {
            prepare: async () => oversized,
            postJson: async () => presign(),
            putJpeg: async () => {
              puts += 1;
              return true;
            },
          }
        ),
      (error: unknown) => {
        assert.ok(error instanceof JobPhotoClientError);
        assert.match(error.message, /zbyt duże/);
        return true;
      }
    );
    assert.equal(puts, 0);
  });
});

describe("sequential retry", () => {
  it("stops on the failing photo and skips files already finalized in this dialog", async () => {
    const first = { id: "1" };
    const second = { id: "2" };
    const third = { id: "3" };
    const uploaded: string[] = [];

    await assert.rejects(
      () =>
        uploadStagePhotoSequence({
          files: [first, second, third],
          finalized: new Set([first]),
          uploadOne: async (file) => {
            uploaded.push(file.id);
            if (file === second) throw new JobPhotoClientError("Nie udało się przesłać zdjęcia „b.jpg”.");
          },
          onFinalized: () => {
            throw new Error("failed photo must not be marked finalized");
          },
          onProgress: () => undefined,
        }),
      (error: unknown) => error instanceof JobPhotoClientError
    );
    assert.deepEqual(uploaded, ["2"]);

    const finalized = new Set([first, second]);
    const retried: string[] = [];
    await uploadStagePhotoSequence({
      files: [first, second, third],
      finalized,
      uploadOne: async (file) => {
        retried.push(file.id);
      },
      onFinalized: (file) => {
        finalized.add(file);
      },
      onProgress: (progress) => {
        if (progress.current !== null) assert.equal(progress.current, 3);
      },
      });
    assert.deepEqual(retried, ["3"]);
    assert.equal(finalized.has(third), true);
  });
});

describe("public errors and page wiring", () => {
  it("hides signed URLs and intent tokens from stage errors", () => {
    const shown = stageFinishErrorMessage(new Error(`PUT failed ${UPLOAD_URL}`));
    assert.equal(shown, "Nie udało się zapisać etapu. Spróbuj ponownie.");
    assert.match(
      stageFinishErrorMessage(new JobPhotoClientError("Nie udało się przesłać zdjęcia „a.jpg”. Spróbuj ponownie.")),
      /a\.jpg/
    );
  });

  it("removes the placeholder upload from the job page", () => {
    const page = readFileSync("app/jobs/[jobId]/page.tsx", "utf8");
    const client = readFileSync("lib/client/jobs/upload-stage-photo.ts", "utf8");
    assert.doesNotMatch(page, /todo:\/\/upload/);
    assert.doesNotMatch(page, /TODO AUTH/);
    assert.doesNotMatch(page, /UPLOAD TODO/);
    assert.doesNotMatch(page, /compressImage/);
    assert.doesNotMatch(page, /lista_zdjec:\s*urls/);
    assert.match(page, /uploadStagePhotoSequence/);
    assert.doesNotMatch(client, /@vercel\/blob/);
    assert.doesNotMatch(client, /server-only/);
    assert.doesNotMatch(client, /console\.log/);
  });
});
