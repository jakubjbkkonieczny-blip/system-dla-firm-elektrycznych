import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePushSubscriptionBody } from "../subscription-validation";

describe("parsePushSubscriptionBody", () => {
  it("accepts standard browser subscription shape", () => {
    const parsed = parsePushSubscriptionBody({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "key1", auth: "auth1" },
    });

    assert.equal(parsed.endpoint, "https://push.example/abc");
    assert.equal(parsed.p256dh, "key1");
    assert.equal(parsed.auth, "auth1");
  });

  it("requires endpoint", () => {
    assert.throws(
      () => parsePushSubscriptionBody({ keys: { p256dh: "k", auth: "a" } }),
      /INVALID_SUBSCRIPTION:endpoint/
    );
  });

  it("requires p256dh and auth", () => {
    assert.throws(
      () =>
        parsePushSubscriptionBody({
          endpoint: "https://push.example/abc",
          keys: { p256dh: "", auth: "a" },
        }),
      /INVALID_SUBSCRIPTION:p256dh/
    );
    assert.throws(
      () =>
        parsePushSubscriptionBody({
          endpoint: "https://push.example/abc",
          keys: { p256dh: "k", auth: "" },
        }),
      /INVALID_SUBSCRIPTION:auth/
    );
  });
});
