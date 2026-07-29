import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTH_ERROR_CATEGORIES,
  classifyProviderAuthError,
  publicMessageForAuthError,
  SupabaseAuthError,
} from "../errors";

describe("Supabase Auth errors", () => {
  it("exposes the required observation categories", () => {
    for (const required of [
      "AUTH_CONFIGURATION_ERROR",
      "AUTH_UNAUTHENTICATED",
      "AUTH_CALLBACK_INVALID",
      "AUTH_CALLBACK_EXPIRED",
      "AUTH_USER_UNLINKED",
      "AUTH_USER_CONFLICT",
      "AUTH_USER_INACTIVE",
      "AUTH_EMAIL_CONFLICT",
      "AUTH_PROVIDER_UNAVAILABLE",
      "AUTH_PROVISIONING_FAILED",
      "AUTH_PASSWORD_RECOVERY_INVALID",
      "AUTH_PASSWORD_REAUTH_REQUIRED",
    ]) {
      assert.ok(AUTH_ERROR_CATEGORIES.includes(required as (typeof AUTH_ERROR_CATEGORIES)[number]));
    }
  });

  it("never puts secrets into public messages", () => {
    for (const category of AUTH_ERROR_CATEGORIES) {
      const msg = publicMessageForAuthError(category);
      assert.doesNotMatch(msg, /token|supabase|passwordHash|uuid|jwt/i);
      assert.ok(msg.length > 0);
    }
  });

  it("classifies expired vs invalid provider errors", () => {
    assert.equal(
      classifyProviderAuthError({ message: "otp_expired", status: 400 }),
      "AUTH_CALLBACK_EXPIRED"
    );
    assert.equal(
      classifyProviderAuthError({ message: "invalid request", status: 400 }),
      "AUTH_CALLBACK_INVALID"
    );
  });

  it("SupabaseAuthError carries category and safe public code", () => {
    const err = new SupabaseAuthError("AUTH_USER_UNLINKED");
    assert.equal(err.category, "AUTH_USER_UNLINKED");
    assert.equal(err.httpStatus, 403);
  });
});
