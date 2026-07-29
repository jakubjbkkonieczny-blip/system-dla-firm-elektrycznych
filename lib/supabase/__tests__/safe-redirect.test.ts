import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SAFE_REDIRECT_PATH,
  isSafeRedirectPath,
  safeRedirectPath,
} from "../safe-redirect";

describe("safeRedirectPath", () => {
  it("accepts safe internal paths", () => {
    assert.equal(safeRedirectPath("/login"), "/login");
    assert.equal(safeRedirectPath("/dashboard"), "/dashboard");
    assert.equal(safeRedirectPath("/auth/reset-password"), "/auth/reset-password");
    assert.equal(safeRedirectPath("/login?type=worker"), "/login?type=worker");
    assert.equal(safeRedirectPath("/a#section"), "/a#section");
  });

  it("rejects absolute external URLs", () => {
    assert.equal(safeRedirectPath("https://evil.example/phish"), DEFAULT_SAFE_REDIRECT_PATH);
    assert.equal(safeRedirectPath("http://evil.example"), DEFAULT_SAFE_REDIRECT_PATH);
  });

  it("rejects protocol-relative URLs", () => {
    assert.equal(safeRedirectPath("//evil.example"), DEFAULT_SAFE_REDIRECT_PATH);
    assert.equal(safeRedirectPath("/\\evil.example"), DEFAULT_SAFE_REDIRECT_PATH);
  });

  it("rejects encoded external / protocol-relative redirects", () => {
    assert.equal(
      safeRedirectPath("%2F%2Fevil.example"),
      DEFAULT_SAFE_REDIRECT_PATH
    );
    assert.equal(
      safeRedirectPath("%252F%252Fevil.example"),
      DEFAULT_SAFE_REDIRECT_PATH
    );
    assert.equal(
      safeRedirectPath(encodeURIComponent("https://evil.example")),
      DEFAULT_SAFE_REDIRECT_PATH
    );
  });

  it("rejects javascript and data URLs", () => {
    assert.equal(safeRedirectPath("javascript:alert(1)"), DEFAULT_SAFE_REDIRECT_PATH);
    assert.equal(safeRedirectPath("data:text/html,hi"), DEFAULT_SAFE_REDIRECT_PATH);
  });

  it("rejects backslash and malformed values", () => {
    assert.equal(safeRedirectPath("/ok\\path"), DEFAULT_SAFE_REDIRECT_PATH);
    assert.equal(safeRedirectPath(""), DEFAULT_SAFE_REDIRECT_PATH);
    assert.equal(safeRedirectPath(null), DEFAULT_SAFE_REDIRECT_PATH);
    assert.equal(safeRedirectPath("dashboard"), DEFAULT_SAFE_REDIRECT_PATH);
    assert.equal(safeRedirectPath("   "), DEFAULT_SAFE_REDIRECT_PATH);
  });

  it("rejects control characters", () => {
    assert.equal(safeRedirectPath("/login\n/extra"), DEFAULT_SAFE_REDIRECT_PATH);
    assert.equal(safeRedirectPath("/login\u0000"), DEFAULT_SAFE_REDIRECT_PATH);
  });

  it("isSafeRedirectPath mirrors acceptance", () => {
    assert.equal(isSafeRedirectPath("/login"), true);
    assert.equal(isSafeRedirectPath("//evil"), false);
    assert.equal(isSafeRedirectPath(null), false);
  });
});
