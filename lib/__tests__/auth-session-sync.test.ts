import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTH_SESSION_REFRESH_MIN_INTERVAL_MS,
  shouldRefreshSessionOnFocus,
} from "../authSessionSync";

describe("auth session cross-tab refresh", () => {
  it("refreshes when tab becomes visible after the minimum interval", () => {
    assert.equal(
      shouldRefreshSessionOnFocus({
        visibilityState: "visible",
        now: 5000,
        lastRefreshAt: 0,
      }),
      true
    );
  });

  it("does not refresh when tab is hidden", () => {
    assert.equal(
      shouldRefreshSessionOnFocus({
        visibilityState: "hidden",
        now: 5000,
        lastRefreshAt: 0,
      }),
      false
    );
  });

  it("does not spam refresh when focus events arrive too quickly", () => {
    assert.equal(
      shouldRefreshSessionOnFocus({
        visibilityState: "visible",
        now: 1000,
        lastRefreshAt: 500,
        minIntervalMs: AUTH_SESSION_REFRESH_MIN_INTERVAL_MS,
      }),
      false
    );
  });

  it("allows refresh again after the debounce interval", () => {
    assert.equal(
      shouldRefreshSessionOnFocus({
        visibilityState: "visible",
        now: 3000,
        lastRefreshAt: 0,
        minIntervalMs: AUTH_SESSION_REFRESH_MIN_INTERVAL_MS,
      }),
      true
    );
  });
});
