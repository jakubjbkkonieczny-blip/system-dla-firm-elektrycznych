/**
 * Session route error mapping — includes Supabase Auth typed failures.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  handleSessionRouteError,
  handleSessionRouteErrorOr,
} from "../handle-session-route-error";
import { SupabaseAuthError } from "@/lib/supabase/errors";

describe("handleSessionRouteError", () => {
  it("maps MISSING_AUTH to 401 Unauthorized", async () => {
    const res = handleSessionRouteError(new Error("MISSING_AUTH"));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "Unauthorized");
  });

  it("maps SupabaseAuthError with publicCode and httpStatus", async () => {
    const res = handleSessionRouteError(
      new SupabaseAuthError("AUTH_CONFIGURATION_ERROR")
    );
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "AUTH_CONFIGURATION_ERROR");
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  });

  it("maps AUTH_PROVIDER_UNAVAILABLE via SupabaseAuthError", async () => {
    const res = handleSessionRouteError(
      new SupabaseAuthError("AUTH_PROVIDER_UNAVAILABLE")
    );
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "AUTH_PROVIDER_UNAVAILABLE");
  });

  it("allows custom business mapping and keeps SupabaseAuthError first", async () => {
    const supabase = handleSessionRouteErrorOr(
      new SupabaseAuthError("AUTH_PASSWORD_REAUTH_REQUIRED"),
      (msg) => (msg === "AUTH_PASSWORD_REAUTH_REQUIRED" ? 401 : null)
    );
    assert.equal(supabase.status, 401);
    const supabaseBody = await supabase.json();
    assert.equal(supabaseBody.error, "AUTH_PASSWORD_REAUTH_REQUIRED");

    const business = handleSessionRouteErrorOr(new Error("INVALID_PASSWORD"), (msg) =>
      msg === "INVALID_PASSWORD" ? 401 : null
    );
    assert.equal(business.status, 401);
    const businessBody = await business.json();
    assert.equal(businessBody.error, "INVALID_PASSWORD");
  });
});
