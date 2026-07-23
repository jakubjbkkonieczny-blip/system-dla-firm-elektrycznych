import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEGACY_ACTIVE_COMPANY_ID_KEY,
  readScopedActiveCompanyId,
  removeLegacyActiveCompanyId,
  resolveActiveCompanyId,
  scopedActiveCompanyKey,
  writeScopedActiveCompanyId,
} from "../activeCompanyStorage";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

describe("active company storage", () => {
  it("scopes storage keys by authenticated user id", () => {
    assert.equal(scopedActiveCompanyKey("user-a"), "activeCompanyId:user-a");
    assert.equal(scopedActiveCompanyKey("user-b"), "activeCompanyId:user-b");
  });

  it("stores and reads per-user active company without cross-user leakage", () => {
    const storage = createMemoryStorage();

    writeScopedActiveCompanyId(storage, "employer-a", "company-a");
    writeScopedActiveCompanyId(storage, "worker-b", "company-b");

    assert.equal(readScopedActiveCompanyId(storage, "employer-a"), "company-a");
    assert.equal(readScopedActiveCompanyId(storage, "worker-b"), "company-b");
    assert.equal(readScopedActiveCompanyId(storage, "employer-c"), "");
  });

  it("does not assign legacy global activeCompanyId to a new account", () => {
    const storage = createMemoryStorage({
      [LEGACY_ACTIVE_COMPANY_ID_KEY]: "company-a",
    });

    const resolved = resolveActiveCompanyId({
      userId: "worker-b",
      storedCompanyId: "",
      legacyGlobalCompanyId: "company-a",
      accessibleCompanyIds: ["company-b"],
    });

    assert.equal(resolved.activeCompanyId, "company-b");
    assert.equal(resolved.persistCompanyId, "company-b");
    assert.equal(resolved.discardLegacy, true);
    assert.equal(readScopedActiveCompanyId(storage, "worker-b"), "");
  });

  it("rejects invalid stored company ids when multiple companies are accessible", () => {
    const resolved = resolveActiveCompanyId({
      userId: "worker-b",
      storedCompanyId: "company-a",
      legacyGlobalCompanyId: "",
      accessibleCompanyIds: ["company-b", "company-c"],
    });

    assert.equal(resolved.activeCompanyId, null);
    assert.equal(resolved.persistCompanyId, null);
  });

  it("ignores invalid stored id and auto-selects the only accessible company", () => {
    const resolved = resolveActiveCompanyId({
      userId: "worker-b",
      storedCompanyId: "company-a",
      legacyGlobalCompanyId: "",
      accessibleCompanyIds: ["company-b"],
    });

    assert.equal(resolved.activeCompanyId, "company-b");
    assert.equal(resolved.persistCompanyId, "company-b");
  });

  it("auto-selects when the user has exactly one accessible company", () => {
    const resolved = resolveActiveCompanyId({
      userId: "employer-a",
      storedCompanyId: "",
      legacyGlobalCompanyId: "",
      accessibleCompanyIds: ["company-a"],
    });

    assert.equal(resolved.activeCompanyId, "company-a");
    assert.equal(resolved.persistCompanyId, "company-a");
  });

  it("preserves valid per-user selection when multiple companies exist", () => {
    const resolved = resolveActiveCompanyId({
      userId: "worker-x",
      storedCompanyId: "company-b",
      legacyGlobalCompanyId: "",
      accessibleCompanyIds: ["company-a", "company-b"],
    });

    assert.equal(resolved.activeCompanyId, "company-b");
    assert.equal(resolved.persistCompanyId, null);
  });

  it("requires explicit selection when multiple companies exist and stored id is invalid", () => {
    const resolved = resolveActiveCompanyId({
      userId: "worker-x",
      storedCompanyId: "company-z",
      legacyGlobalCompanyId: "",
      accessibleCompanyIds: ["company-a", "company-b"],
    });

    assert.equal(resolved.activeCompanyId, null);
    assert.equal(resolved.persistCompanyId, null);
  });

  it("returns null when user has zero companies", () => {
    const resolved = resolveActiveCompanyId({
      userId: "worker-b",
      storedCompanyId: "company-b",
      legacyGlobalCompanyId: "",
      accessibleCompanyIds: [],
    });

    assert.equal(resolved.activeCompanyId, null);
    assert.equal(resolved.persistCompanyId, null);
  });

  it("simulates employer A logout and worker B login without inheriting company A", () => {
    const storage = createMemoryStorage({
      [LEGACY_ACTIVE_COMPANY_ID_KEY]: "company-a",
      [scopedActiveCompanyKey("employer-a")]: "company-a",
    });

    removeLegacyActiveCompanyId(storage);

    const workerResolved = resolveActiveCompanyId({
      userId: "worker-b",
      storedCompanyId: readScopedActiveCompanyId(storage, "worker-b"),
      legacyGlobalCompanyId: storage.getItem(LEGACY_ACTIVE_COMPANY_ID_KEY) || "",
      accessibleCompanyIds: ["company-b"],
    });

    if (workerResolved.discardLegacy) {
      removeLegacyActiveCompanyId(storage);
    }
    if (workerResolved.persistCompanyId) {
      writeScopedActiveCompanyId(storage, "worker-b", workerResolved.persistCompanyId);
    }

    assert.equal(readScopedActiveCompanyId(storage, "worker-b"), "company-b");
    assert.equal(readScopedActiveCompanyId(storage, "employer-a"), "company-a");
    assert.equal(storage.getItem(LEGACY_ACTIVE_COMPANY_ID_KEY), null);
  });

  it("simulates worker B logout and employer A login restoring own scoped company", () => {
    const storage = createMemoryStorage({
      [scopedActiveCompanyKey("employer-a")]: "company-a",
      [scopedActiveCompanyKey("worker-b")]: "company-b",
    });

    removeLegacyActiveCompanyId(storage);

    const employerResolved = resolveActiveCompanyId({
      userId: "employer-a",
      storedCompanyId: readScopedActiveCompanyId(storage, "employer-a"),
      legacyGlobalCompanyId: "",
      accessibleCompanyIds: ["company-a"],
    });

    assert.equal(employerResolved.activeCompanyId, "company-a");
    assert.equal(readScopedActiveCompanyId(storage, "worker-b"), "company-b");
  });
});
