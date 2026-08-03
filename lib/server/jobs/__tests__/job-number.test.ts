import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  companyAdvisoryLockKey,
  isSignedInt64,
} from "@/lib/server/jobs/job-advisory-lock-key";

describe("companyAdvisoryLockKey", () => {
  it("stays within signed int64 for varied company ids", () => {
    const samples = [
      "cmpa5dv4w0001ipjrjwkyfovv",
      "cmsde4lv1000112cxevywj2wj",
      "a",
      "company-with-high-bit-pressure-0123456789abcdef",
      ..."abcdefghijklmnopqrstuvwxyz".split("").map((c) => `cmp-${c.repeat(24)}`),
    ];

    for (const id of samples) {
      const key = companyAdvisoryLockKey(id);
      assert.equal(isSignedInt64(key), true, `out of range for ${id}: ${key}`);
    }
  });

  it("is deterministic and distinct for different ids", () => {
    const a = companyAdvisoryLockKey("company-a");
    const b = companyAdvisoryLockKey("company-b");
    assert.equal(companyAdvisoryLockKey("company-a"), a);
    assert.notEqual(a, b);
  });

  it("maps former unsigned-overflow patterns into signed int64", () => {
    // High bit set in upper 32 → unsigned value > INT64_MAX before asIntN.
    const key = companyAdvisoryLockKey("cmsde4lv1000112cxevywj2wj");
    assert.equal(isSignedInt64(key), true);
    assert.ok(key < BigInt(0) || key <= BigInt(2) ** BigInt(63) - BigInt(1));
  });
});

