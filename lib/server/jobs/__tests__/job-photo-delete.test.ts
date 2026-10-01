import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import { before, describe, it } from "node:test";

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

type PhotoDeleteModule = typeof import("@/lib/server/jobs/job-photo-delete");
type DeleteCompanyPhotoInput = Parameters<PhotoDeleteModule["deleteAuthorizedCompanyPhoto"]>[0];

let assertOwnerCanDeleteJobPhoto: PhotoDeleteModule["assertOwnerCanDeleteJobPhoto"];
let deleteAuthorizedCompanyPhoto: PhotoDeleteModule["deleteAuthorizedCompanyPhoto"];
let memberCanDeleteCompanyPhotos: PhotoDeleteModule["memberCanDeleteCompanyPhotos"];

before(async () => {
  const photoDelete = await import("@/lib/server/jobs/job-photo-delete");
  assertOwnerCanDeleteJobPhoto = photoDelete.assertOwnerCanDeleteJobPhoto;
  deleteAuthorizedCompanyPhoto = photoDelete.deleteAuthorizedCompanyPhoto;
  memberCanDeleteCompanyPhotos = photoDelete.memberCanDeleteCompanyPhotos;
});

const companyId = "company_a";
const photoId = "photo_1";
const dbObjectKey = "companies/company_a/jobs/job_1/photos/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg";
const clientObjectKey = "companies/evil/jobs/job_x/photos/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg";

const owner = { role: "owner", isActive: true };

function harness(overrides: Partial<DeleteCompanyPhotoInput> = {}) {
  const calls: string[] = [];
  const logs: { message: string; context: Record<string, string | number> }[] = [];
  let blobKey = "";

  const input: DeleteCompanyPhotoInput = {
    companyId,
    photoId,
    member: owner,
    findPhoto: async (query) => {
      calls.push(`find:${query.id}:${query.companyId}`);
      return { id: photoId, objectKey: dbObjectKey };
    },
    deleteBlob: async (objectKey) => {
      calls.push(`blob:${objectKey}`);
      blobKey = objectKey;
    },
    deletePhotoRow: async (query) => {
      calls.push(`db:${query.id}:${query.companyId}`);
      return { count: 1 };
    },
    log: (message, context) => {
      logs.push({ message, context });
    },
    ...overrides,
  };

  return { input, calls, logs, blobKey: () => blobKey };
}

describe("owner photo delete policy", () => {
  it("allows only an active owner", () => {
    assert.equal(memberCanDeleteCompanyPhotos({ role: "owner" }), true);
    assert.equal(memberCanDeleteCompanyPhotos({ role: "admin" }), false);
    assert.equal(memberCanDeleteCompanyPhotos({ role: "staff" }), false);
    assert.equal(memberCanDeleteCompanyPhotos({ role: "kierownik" }), false);
    assert.equal(memberCanDeleteCompanyPhotos({ role: "" }), false);
    assert.doesNotThrow(() => assertOwnerCanDeleteJobPhoto(owner));
  });

  it("rejects admin, staff, supervisor-shaped staff, and inactive members", () => {
    for (const role of ["admin", "staff", "kierownik"]) {
      assert.throws(() => assertOwnerCanDeleteJobPhoto({ role, isActive: true }), /FORBIDDEN/);
    }
    assert.throws(
      () => assertOwnerCanDeleteJobPhoto({ role: "owner", isActive: false }),
      /NOT_MEMBER/
    );
  });
});

describe("deleteAuthorizedCompanyPhoto", () => {
  it("deletes the blob from the database row, then the company-scoped row", async () => {
    const { input, calls, logs, blobKey } = harness();
    const withClientKey = input as DeleteCompanyPhotoInput & { objectKey: string };
    withClientKey.objectKey = clientObjectKey;

    await deleteAuthorizedCompanyPhoto(withClientKey);

    assert.deepEqual(calls, [
      `find:${photoId}:${companyId}`,
      `blob:${dbObjectKey}`,
      `db:${photoId}:${companyId}`,
    ]);
    assert.equal(blobKey(), dbObjectKey);
    assert.notEqual(blobKey(), clientObjectKey);
    assert.equal(logs.length, 0);
  });

  it("does not touch storage when admin, staff, or an inactive member is refused", async () => {
    for (const member of [
      { role: "admin", isActive: true },
      { role: "staff", isActive: true },
      { role: "owner", isActive: false },
    ]) {
      const { input, calls } = harness({ member });
      const expected = member.isActive ? /FORBIDDEN/ : /NOT_MEMBER/;
      await assert.rejects(() => deleteAuthorizedCompanyPhoto(input), expected);
      assert.deepEqual(calls, []);
    }
  });

  it("does not delete storage when the photo is outside the company", async () => {
    let seen: { id: string; companyId: string } | null = null;
    const { input, calls } = harness({
      photoId: "photo_other_company",
      findPhoto: async (query) => {
        seen = query;
        calls.push("find");
        return null;
      },
    });

    await assert.rejects(() => deleteAuthorizedCompanyPhoto(input), /PHOTO_NOT_FOUND/);
    assert.deepEqual(seen, { id: "photo_other_company", companyId });
    assert.deepEqual(calls, ["find"]);
  });

  it("rejects a photo id that is really an object key before any lookup", async () => {
    const { input, calls } = harness({
      photoId: clientObjectKey,
    });
    await assert.rejects(() => deleteAuthorizedCompanyPhoto(input), /PHOTO_NOT_FOUND/);
    assert.deepEqual(calls, []);
  });

  it("keeps the database row when blob deletion fails", async () => {
    let rowDeleted = false;
    const { input, logs } = harness({
      deleteBlob: async () => {
        throw new Error("provider down https://signed.example/secret");
      },
      deletePhotoRow: async () => {
        rowDeleted = true;
        return { count: 1 };
      },
    });

    await assert.rejects(() => deleteAuthorizedCompanyPhoto(input), /PHOTO_DELETE_FAILED/);
    assert.equal(rowDeleted, false);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.message, "job photo blob delete failed");
    assert.equal(logs[0]?.context.photoId, photoId);
    assert.equal(logs[0]?.context.companyId, companyId);
    assert.equal("objectKey" in (logs[0]?.context ?? {}), false);
    assert.doesNotMatch(JSON.stringify(logs[0]?.context), /signed\.example/);
  });

  it("reports an incomplete delete when the row delete fails after the blob is gone", async () => {
    let blobDeleted = false;
    const { input, logs } = harness({
      deleteBlob: async (objectKey) => {
        blobDeleted = objectKey === dbObjectKey;
      },
      deletePhotoRow: async () => {
        throw new Error("database unavailable");
      },
    });

    await assert.rejects(() => deleteAuthorizedCompanyPhoto(input), /PHOTO_DELETE_INCOMPLETE/);
    assert.equal(blobDeleted, true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.context.objectKey, dbObjectKey);
    assert.notEqual(logs[0]?.context.objectKey, clientObjectKey);
    assert.equal("readUrl" in (logs[0]?.context ?? {}), false);
  });

  it("reports an incomplete delete when the row delete does not remove exactly one row", async () => {
    const { input, logs } = harness({
      deletePhotoRow: async () => ({ count: 0 }),
    });
    await assert.rejects(() => deleteAuthorizedCompanyPhoto(input), /PHOTO_DELETE_INCOMPLETE/);
    assert.equal(logs[0]?.context.objectKey, dbObjectKey);
    assert.equal(logs[0]?.context.deletedCount, 0);
  });
});

describe("photo delete route boundary", () => {
  it("authorizes the owner, loads the row by company, and never accepts a client object key", async () => {
    const route = await readFile(
      new URL("../../../../app/api/companies/[companyId]/photos/[photoId]/route.ts", import.meta.url),
      "utf8"
    );
    const service = await readFile(new URL("../job-photo-delete.ts", import.meta.url), "utf8");
    const read = await readFile(new URL("../job-photo-read.ts", import.meta.url), "utf8");
    const adapter = await readFile(
      new URL("../../storage/vercel-photo-storage.ts", import.meta.url),
      "utf8"
    );

    const handler = route.slice(route.indexOf("export async function DELETE"));
    const sessionAt = handler.indexOf("requireSessionUser");
    const memberAt = handler.indexOf("requireActiveMember");
    const assertAt = handler.indexOf("assertOwnerCanDeleteJobPhoto");
    const deleteAt = handler.indexOf("deleteAuthorizedCompanyPhoto");
    assert.ok(sessionAt >= 0 && sessionAt < memberAt);
    assert.ok(memberAt < assertAt);
    assert.ok(assertAt < deleteAt);
    assert.match(route, /companyId: query\.companyId/);
    assert.match(route, /select:\s*\{ id: true, objectKey: true \}/);
    assert.doesNotMatch(route, /@vercel\/blob/);
    assert.doesNotMatch(route, /BLOB_READ_WRITE_TOKEN/);
    assert.doesNotMatch(route, /\.json\(\)/);
    assert.doesNotMatch(route, /searchParams/);
    assert.doesNotMatch(route, /uploadedByUserId/);
    assert.doesNotMatch(route, /supervisorUserId/);
    assert.doesNotMatch(route, /accountRole/);
    assert.match(route, /Cache-Control": "no-store"/);

    assert.doesNotMatch(service, /@vercel\/blob/);
    assert.doesNotMatch(service, /uploadedByUserId/);
    assert.doesNotMatch(service, /supervisorUserId/);
    assert.match(service, /await deleteBlob\(row\.objectKey\)/);
    const blobAt = service.indexOf("await deleteBlob(row.objectKey)");
    const rowAt = service.indexOf("await deletePhotoRow(query)");
    assert.ok(blobAt >= 0 && blobAt < rowAt);

    assert.match(read, /canDeletePhotos: memberCanDeleteCompanyPhotos\(input\.member\)/);
    assert.doesNotMatch(read, /@vercel\/blob/);

    const deleteFn = adapter.slice(adapter.indexOf("async function deleteObject"));
    assert.match(deleteFn, /BlobNotFoundError/);
    assert.doesNotMatch(adapter, /BLOB_READ_WRITE_TOKEN/);
  });
});
