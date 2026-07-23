import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapPushSubscribeErrorToUserMessage,
  mapPushUnsubscribeErrorToUserMessage,
  PUSH_UI_COPY,
  resolvePushBrowserState,
} from "../ui-state";

describe("push UI state", () => {
  it("detects unsupported browsers", () => {
    assert.equal(
      resolvePushBrowserState({
        supported: false,
        permission: "default",
        hasSubscription: false,
      }),
      "unsupported"
    );
  });

  it("detects permission denied", () => {
    assert.equal(
      resolvePushBrowserState({
        supported: true,
        permission: "denied",
        hasSubscription: false,
      }),
      "permission_denied"
    );
  });

  it("detects permission denied even when a stale subscription exists", () => {
    assert.equal(
      resolvePushBrowserState({
        supported: true,
        permission: "denied",
        hasSubscription: true,
      }),
      "permission_denied"
    );
  });

  it("detects not enabled when permission is default and there is no subscription", () => {
    assert.equal(
      resolvePushBrowserState({
        supported: true,
        permission: "default",
        hasSubscription: false,
      }),
      "not_enabled"
    );
  });

  it("detects not enabled when permission is granted but there is no subscription", () => {
    assert.equal(
      resolvePushBrowserState({
        supported: true,
        permission: "granted",
        hasSubscription: false,
      }),
      "not_enabled"
    );
  });

  it("detects active subscription", () => {
    assert.equal(
      resolvePushBrowserState({
        supported: true,
        permission: "granted",
        hasSubscription: true,
      }),
      "enabled"
    );
  });

  it("maps subscribe errors to user-friendly messages without technical codes", () => {
    assert.equal(mapPushSubscribeErrorToUserMessage("PERMISSION_DENIED"), PUSH_UI_COPY.permissionDenied);
    assert.equal(mapPushSubscribeErrorToUserMessage("VAPID_NOT_CONFIGURED"), PUSH_UI_COPY.subscribeError);
    assert.equal(mapPushSubscribeErrorToUserMessage("HTTP_500"), PUSH_UI_COPY.subscribeError);
    assert.doesNotMatch(mapPushSubscribeErrorToUserMessage("HTTP_500"), /HTTP_/);
    assert.doesNotMatch(mapPushSubscribeErrorToUserMessage("VAPID_NOT_CONFIGURED"), /VAPID/);
  });

  it("maps unsubscribe errors to user-friendly messages", () => {
    assert.equal(mapPushUnsubscribeErrorToUserMessage("HTTP_403"), PUSH_UI_COPY.unsubscribeError);
    assert.doesNotMatch(mapPushUnsubscribeErrorToUserMessage("HTTP_403"), /HTTP_/);
  });

  it("uses production copy without dev wording", () => {
    assert.doesNotMatch(PUSH_UI_COPY.enableButton, /test|dev|foundation|vapid|subscription/i);
    assert.doesNotMatch(PUSH_UI_COPY.enabled, /test|dev|foundation|vapid|subscription/i);
    assert.doesNotMatch(PUSH_UI_COPY.subscribeSuccess, /test|dev|foundation|vapid|subscription/i);
  });
});
