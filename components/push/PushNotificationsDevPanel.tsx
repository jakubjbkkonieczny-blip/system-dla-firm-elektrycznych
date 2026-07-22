"use client";

import { useState } from "react";
import { isPushSupported, subscribeToPushNotifications, unsubscribeFromPushNotifications } from "@/lib/push/client";
import { apiFetch } from "@/lib/api";

export function PushNotificationsDevPanel() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const supported = isPushSupported();
  const isDev = process.env.NODE_ENV !== "production";

  async function onSubscribe() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const result = await subscribeToPushNotifications();
      if (!result.ok) {
        setErr(result.reason);
        return;
      }
      setMsg("Powiadomienia push włączone na tym urządzeniu.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "SUBSCRIBE_ERROR");
    } finally {
      setBusy(false);
    }
  }

  async function onUnsubscribe() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const result = await unsubscribeFromPushNotifications();
      if (!result.ok) {
        setErr(result.reason || "UNSUBSCRIBE_ERROR");
        return;
      }
      setMsg("Powiadomienia push wyłączone na tym urządzeniu.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "UNSUBSCRIBE_ERROR");
    } finally {
      setBusy(false);
    }
  }

  async function onTestPush() {
    if (!isDev) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await apiFetch("/api/push/test", {
        method: "POST",
        body: JSON.stringify({
          title: "VectorWork — test",
          body: "Test foundation push (dev).",
          url: "/notifications",
        }),
      });
      setMsg("Wysłano testowe powiadomienie (historia + push best-effort).");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "TEST_PUSH_ERROR");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        {supported
          ? "Włącz push na tym urządzeniu (wymaga Twojej akcji — bez auto-promptu)."
          : "Ten browser nie obsługuje Web Push / Service Worker."}
      </p>

      {err ? (
        <div className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-lg">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div className="text-sm text-success border border-success-border bg-success-bg p-3 rounded-lg">
          {msg}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          disabled={!supported || busy}
          onClick={() => void onSubscribe()}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-fg transition disabled:opacity-50"
        >
          Włącz push (test)
        </button>
        <button
          type="button"
          disabled={!supported || busy}
          onClick={() => void onUnsubscribe()}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-border text-text hover:bg-card-hover transition disabled:opacity-50"
        >
          Wyłącz push
        </button>
        {isDev ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onTestPush()}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition disabled:opacity-50"
          >
            Wyślij test push
          </button>
        ) : null}
      </div>
    </div>
  );
}
