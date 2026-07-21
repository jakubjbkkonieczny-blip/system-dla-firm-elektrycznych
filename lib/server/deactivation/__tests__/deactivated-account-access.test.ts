import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDeactivatedAccessToken,
  DEACTIVATED_ACCESS_PURPOSE,
  verifyDeactivatedAccessToken,
} from "../deactivated-account-access";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

function decodeDeactivatedPayload(token: string): { purpose?: string; userId?: string } {
  const inner = Buffer.from(token, "base64url").toString("utf8");
  const dot = inner.indexOf(".");
  const payloadJson = Buffer.from(inner.slice(0, dot), "base64url").toString("utf8");
  return JSON.parse(payloadJson) as { purpose?: string; userId?: string };
}

describe("deactivated account access tokens", () => {
  it("creates and verifies a deactivated access token", () => {
    const token = createDeactivatedAccessToken("user-1");
    const verified = verifyDeactivatedAccessToken(token);
    assert.ok(verified);
    assert.equal(verified.userId, "user-1");
  });

  it("embeds a dedicated deactivated access purpose in the token payload", () => {
    const token = createDeactivatedAccessToken("user-1");
    const payload = decodeDeactivatedPayload(token);
    assert.equal(payload.purpose, DEACTIVATED_ACCESS_PURPOSE);
    assert.equal(payload.userId, "user-1");
  });

  it("rejects malformed tokens", () => {
    assert.equal(verifyDeactivatedAccessToken("not-a-token"), null);
  });

  it("uses a dedicated deactivated access purpose constant", () => {
    assert.equal(DEACTIVATED_ACCESS_PURPOSE, "DEACTIVATED_ACCOUNT_ACCESS");
  });
});
