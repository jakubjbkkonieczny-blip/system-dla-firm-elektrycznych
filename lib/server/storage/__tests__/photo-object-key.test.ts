import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import { describe, it } from "node:test";

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

describe("createPhotoObjectKey", () => {
  it("uses the company and job namespaces and an unguessable id", async () => {
    const { createPhotoObjectKey } = await import("@/lib/server/storage/photo-object-key");
    const key = createPhotoObjectKey({
      companyId: "cmp_company1",
      jobId: "job-42",
    });

    assert.match(
      key,
      /^companies\/cmp_company1\/jobs\/job-42\/photos\/[a-f0-9]{32}\.jpg$/
    );
    assert.equal(key.startsWith("/"), false);
    assert.equal(key.includes("\\"), false);
    assert.equal(key.includes("site-photo.png"), false);
  });

  it("generates different random identifiers", async () => {
    const { createPhotoObjectKey } = await import("@/lib/server/storage/photo-object-key");
    const input = { companyId: "companyA", jobId: "jobB" };
    const first = createPhotoObjectKey(input);
    const second = createPhotoObjectKey(input);
    assert.notEqual(first, second);
  });

  it("rejects path fragments that could escape the namespace", async () => {
    const { createPhotoObjectKey } = await import("@/lib/server/storage/photo-object-key");
    const badIds = ["../company", "a/b", "a\\b", "has space", "file.jpg", "", ".."];

    for (const companyId of badIds) {
      assert.throws(
        () => createPhotoObjectKey({ companyId, jobId: "job1" }),
        /companyId is not a safe storage identifier/
      );
    }

    assert.throws(
      () => createPhotoObjectKey({ companyId: "company1", jobId: "../job" }),
      /jobId is not a safe storage identifier/
    );
  });

  it("accepts only keys this generator can produce", async () => {
    const { assertPhotoObjectKey, createPhotoObjectKey, isPhotoObjectKey } = await import(
      "@/lib/server/storage/photo-object-key"
    );
    const key = createPhotoObjectKey({ companyId: "c1", jobId: "j1" });
    assert.equal(isPhotoObjectKey(key), true);
    assert.doesNotThrow(() => assertPhotoObjectKey(key));

    for (const bad of [
      `/${key}`,
      key.replaceAll("/", "\\"),
      "companies/c1/jobs/j1/photos/not-random.jpg",
      "https://example.com/photo.jpg",
      "companies/c1/stages/s1/photos/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    ]) {
      assert.equal(isPhotoObjectKey(bad), false);
    }
  });
});

describe("photo storage boundary", () => {
  it("keeps provider details out of the neutral contract and key generator", async () => {
    const contract = await readFile("lib/server/storage/photo-storage.ts", "utf8");
    const keys = await readFile("lib/server/storage/photo-object-key.ts", "utf8");
    const factory = await readFile("lib/server/storage/get-photo-storage.ts", "utf8");
    const provider = await readFile("lib/server/storage/vercel-photo-storage.ts", "utf8");

    for (const source of [contract, keys]) {
      assert.doesNotMatch(source, /@vercel\/blob/);
      assert.doesNotMatch(source, /BLOB_READ_WRITE_TOKEN/);
      assert.doesNotMatch(source, /blobPathname/);
      assert.doesNotMatch(source, /vercelUrl/);
      assert.doesNotMatch(source, /originalFilename/);
      assert.match(source, /import "server-only"/);
    }

    assert.match(factory, /import "server-only"/);
    assert.match(factory, /vercel-photo-storage/);
    assert.doesNotMatch(factory, /@vercel\/blob/);
    assert.doesNotMatch(factory, /BLOB_READ_WRITE_TOKEN/);

    assert.match(provider, /import "server-only"/);
    assert.match(provider, /from "@vercel\/blob"/);
    assert.match(provider, /access: "private"/);
    assert.doesNotMatch(provider, /BLOB_READ_WRITE_TOKEN/);
    assert.doesNotMatch(provider, /\btoken\s*:/);
    assert.doesNotMatch(provider, /oidcToken\s*:/);
    assert.doesNotMatch(provider, /^await /m);
  });
});
