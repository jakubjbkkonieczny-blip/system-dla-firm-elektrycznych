import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateVerificationCode,
  hashVerificationCode,
  getVerificationExpiration,
  VERIFICATION_TOKEN_TTL_MS,
} from "../email-verification";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

describe("deactivation email verification helpers", () => {
  it("generates a 6-digit code", () => {
    const code = generateVerificationCode();
    assert.equal(code.length, 6);
    assert.match(code, /^\d{6}$/);
  });

  it("hashes verification codes deterministically", () => {
    const code = "123456";
    const hashA = hashVerificationCode(code);
    const hashB = hashVerificationCode(code);

    assert.equal(typeof hashA, "string");
    assert.equal(hashA.length, 64);
    assert.equal(hashA, hashB);
  });

  it("creates an expiration date in the expected window", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expiration = getVerificationExpiration(now);

    assert.equal(expiration.getTime(), now.getTime() + VERIFICATION_TOKEN_TTL_MS);
  });
});
