import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PHOTO_MAX_SIZE_BYTES, PHOTO_ORIGINAL_MAX_BYTES } from "@/lib/jobs/photo-limits";
import {
  decideEncodedJpeg,
  JPEG_QUALITY_STEPS,
  originalPhotoInputError,
  scaledPhotoDimensions,
  stagePhotoBatchError,
} from "@/lib/client/images/prepare-job-photo";

const FIFTEEN_MIB = 15 * 1024 * 1024;

describe("stage photo input limits", () => {
  it("rejects more than 10 files and accepts a full batch", () => {
    assert.equal(stagePhotoBatchError(11), "Możesz dodać maksymalnie 10 zdjęć.");
    assert.equal(stagePhotoBatchError(10), null);
    assert.equal(stagePhotoBatchError(0), null);
  });

  it("accepts a 15 MiB original and rejects one byte more", () => {
    assert.equal(PHOTO_ORIGINAL_MAX_BYTES, FIFTEEN_MIB);
    const ok = originalPhotoInputError({ name: "a.jpg", type: "image/jpeg", size: FIFTEEN_MIB });
    const tooBig = originalPhotoInputError({
      name: "a.jpg",
      type: "image/jpeg",
      size: FIFTEEN_MIB + 1,
    });
    assert.equal(ok, null);
    assert.match(tooBig ?? "", /zbyt duże/);
  });

  it("rejects a non-image before any upload", () => {
    const message = originalPhotoInputError({ name: "notatka.txt", type: "text/plain", size: 20 });
    assert.match(message ?? "", /Nie udało się przetworzyć formatu/);
    assert.match(message ?? "", /notatka\.txt/);
  });
});

describe("prepared JPEG size", () => {
  it("accepts a JPEG at the 2 MiB ceiling", () => {
    assert.equal(
      decideEncodedJpeg({ type: "image/jpeg", size: PHOTO_MAX_SIZE_BYTES }, 0),
      "accept"
    );
  });

  it("asks for a lower quality one byte over 2 MiB, then fails on the last step", () => {
    assert.deepEqual(JPEG_QUALITY_STEPS, [0.8, 0.75, 0.68, 0.6]);
    assert.equal(
      decideEncodedJpeg({ type: "image/jpeg", size: PHOTO_MAX_SIZE_BYTES + 1 }, 0),
      "retry_quality"
    );
    assert.equal(
      decideEncodedJpeg({ type: "image/jpeg", size: PHOTO_MAX_SIZE_BYTES + 1 }, 1),
      "retry_quality"
    );
    assert.equal(
      decideEncodedJpeg(
        { type: "image/jpeg", size: PHOTO_MAX_SIZE_BYTES + 1 },
        JPEG_QUALITY_STEPS.length - 1
      ),
      "too_large"
    );
  });

  it("rejects a non-JPEG encode instead of keeping the original", () => {
    assert.equal(decideEncodedJpeg({ type: "image/png", size: 1000 }, 0), "reject");
    assert.equal(decideEncodedJpeg({ type: "image/jpeg", size: 0 }, 0), "reject");
  });
});

describe("scaled photo dimensions", () => {
  it("keeps the aspect ratio, caps the long side at 1600, and does not upscale", () => {
    assert.deepEqual(scaledPhotoDimensions(800, 600), { width: 800, height: 600 });
    assert.deepEqual(scaledPhotoDimensions(3200, 1600), { width: 1600, height: 800 });
    assert.deepEqual(scaledPhotoDimensions(1000, 2000), { width: 800, height: 1600 });
    assert.deepEqual(scaledPhotoDimensions(2000, 2000), { width: 1600, height: 1600 });
    assert.equal(scaledPhotoDimensions(0, 100), null);
  });
});

describe("prepareJobPhoto source", () => {
  it("revokes object URLs and does not fall back to the original file", () => {
    const src = readFileSync("lib/client/images/prepare-job-photo.ts", "utf8");
    assert.match(src, /revokeObjectURL/);
    assert.match(src, /PHOTO_JPEG_CONTENT_TYPE/);
    assert.match(src, /toBlob/);
    assert.doesNotMatch(src, /return file\b/);
    assert.doesNotMatch(src, /\|\|\s*file\s*[),]/);
    assert.match(src, /return withJpegType\(blob\)/);
    assert.doesNotMatch(src, /@vercel\/blob/);
    assert.doesNotMatch(src, /server-only/);
  });
});
