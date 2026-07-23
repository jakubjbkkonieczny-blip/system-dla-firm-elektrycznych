"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  detectPushNotificationState,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push/client";
import {
  mapPushSubscribeErrorToUserMessage,
  mapPushUnsubscribeErrorToUserMessage,
  PUSH_UI_COPY,
  type PushBrowserState,
  type PushOperationState,
} from "@/lib/push/ui-state";

export function PushNotificationsPanel() {
  const [browserState, setBrowserState] = useState<PushBrowserState | "loading">("loading");
  const [operation, setOperation] = useState<PushOperationState>("idle");
  const [testBusy, setTestBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isDev = process.env.NODE_ENV !== "production";

  const refreshBrowserState = useCallback(async () => {
    const nextState = await detectPushNotificationState();
    setBrowserState(nextState);
    return nextState;
  }, []);

  useEffect(() => {
    void refreshBrowserState();
  }, [refreshBrowserState]);

  async function onSubscribe() {
    if (operation !== "idle" || browserState === "permission_denied") return;

    setOperation("enabling");
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const result = await subscribeToPushNotifications();
      if (!result.ok) {
        setErrorMsg(mapPushSubscribeErrorToUserMessage(result.reason));
        console.error("[push] subscribe failed:", result.reason);
        await refreshBrowserState();
        return;
      }

      await refreshBrowserState();
      setSuccessMsg(PUSH_UI_COPY.subscribeSuccess);
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : "SUBSCRIBE_ERROR";
      setErrorMsg(mapPushSubscribeErrorToUserMessage(reason));
      console.error("[push] subscribe failed:", reason);
      await refreshBrowserState();
    } finally {
      setOperation("idle");
    }
  }

  async function onUnsubscribe() {
    if (operation !== "idle") return;

    setOperation("disabling");
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const result = await unsubscribeFromPushNotifications();
      if (!result.ok) {
        setErrorMsg(mapPushUnsubscribeErrorToUserMessage(result.reason || "UNSUBSCRIBE_ERROR"));
        console.error("[push] unsubscribe failed:", result.reason || "UNSUBSCRIBE_ERROR");
        await refreshBrowserState();
        return;
      }

      await refreshBrowserState();
      setSuccessMsg(PUSH_UI_COPY.unsubscribeSuccess);
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : "UNSUBSCRIBE_ERROR";
      setErrorMsg(mapPushUnsubscribeErrorToUserMessage(reason));
      console.error("[push] unsubscribe failed:", reason);
      await refreshBrowserState();
    } finally {
      setOperation("idle");
    }
  }

  async function onTestPush() {
    if (!isDev || operation !== "idle" || testBusy) return;

    setTestBusy(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      await apiFetch("/api/push/test", {
        method: "POST",
        body: JSON.stringify({
          title: "VectorWork — test",
          body: "Test foundation push (dev).",
          url: "/notifications",
        }),
      });
      setSuccessMsg("Wysłano testowe powiadomienie (dev).");
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : "TEST_PUSH_ERROR";
      setErrorMsg(mapPushSubscribeErrorToUserMessage(reason));
      console.error("[push] test failed:", reason);
    } finally {
      setTestBusy(false);
    }
  }

  const busy = operation !== "idle" || testBusy;
  const showEnableButton =
    browserState === "not_enabled" || browserState === "loading";
  const showDisableButton = browserState === "enabled";

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">{PUSH_UI_COPY.deviceHint}</p>

      {browserState === "loading" ? (
        <p className="text-sm text-text-muted">Sprawdzanie stanu powiadomień…</p>
      ) : null}

      {browserState === "unsupported" ? (
        <p className="text-sm text-text-muted">{PUSH_UI_COPY.unsupported}</p>
      ) : null}

      {browserState === "permission_denied" ? (
        <div className="space-y-1">
          <p className="text-sm text-text">{PUSH_UI_COPY.permissionDenied}</p>
          <p className="text-sm text-text-muted">{PUSH_UI_COPY.permissionDeniedHint}</p>
        </div>
      ) : null}

      {browserState === "not_enabled" ? (
        <p className="text-sm text-text">{PUSH_UI_COPY.notEnabled}</p>
      ) : null}

      {browserState === "enabled" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-text">{PUSH_UI_COPY.enabled}</p>
          <span className="inline-block text-xs px-2.5 py-0.5 rounded-full bg-success-bg text-success border border-success-border">
            {PUSH_UI_COPY.enabledBadge}
          </span>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-lg">
          {errorMsg}
        </div>
      ) : null}

      {successMsg ? (
        <div className="text-sm text-success border border-success-border bg-success-bg p-3 rounded-lg">
          {successMsg}
        </div>
      ) : null}

      {browserState !== "unsupported" && browserState !== "permission_denied" ? (
        <div className="flex flex-wrap gap-2 justify-end">
          {showEnableButton ? (
            <button
              type="button"
              disabled={busy || browserState === "loading"}
              onClick={() => void onSubscribe()}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition disabled:opacity-50"
            >
              {operation === "enabling" ? PUSH_UI_COPY.enablingButton : PUSH_UI_COPY.enableButton}
            </button>
          ) : null}

          {showDisableButton ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUnsubscribe()}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-border text-text hover:bg-card-hover transition disabled:opacity-50"
            >
              {operation === "disabling"
                ? PUSH_UI_COPY.disablingButton
                : PUSH_UI_COPY.disableButton}
            </button>
          ) : null}

          {isDev ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onTestPush()}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-fg transition disabled:opacity-50"
            >
              Wyślij test push (dev)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
