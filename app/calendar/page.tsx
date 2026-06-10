"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function CalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(true);
  const [role, setRole] = useState<"worker" | "employer" | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const me = await apiFetch("/api/me");
      setRole(me?.role ?? null);

      if (me?.role === "worker") {
        setLoading(false);
        return;
      }

      const data = await apiFetch("/api/google/events");
      setEvents(data.events || []);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="text-text-muted">Ładowanie...</div>;
  }

  if (role === "worker") {
    return (
      <div className="w-full max-w-full min-w-0">
        <h1 className="text-xl font-semibold text-text">Brak dostępu</h1>
        <p className="text-text-muted mt-2">Nie masz dostępu do kalendarza.</p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="w-full max-w-full min-w-0 space-y-4">
        <h1 className="text-xl font-semibold text-text">Kalendarz</h1>

        <a
          href="/api/google/connect"
          className="inline-flex items-center justify-center min-h-[48px] px-5 py-2 rounded-xl bg-primary text-primary-fg font-medium hover:opacity-90 transition"
        >
          Połącz z Google Calendar
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Kalendarz</h1>
        <p className="text-sm text-text-muted mt-1">Wydarzenia z Google Calendar</p>
      </div>

      {events.length === 0 ? (
        <div className="theme-glass bg-card border border-border rounded-xl p-6 text-text-muted">
          Brak wydarzeń
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <div
              key={e.id}
              className="theme-glass border border-border p-4 rounded-xl bg-card min-w-0"
            >
              <div className="font-semibold text-text">{e.summary}</div>
              <div className="text-sm text-text-muted mt-1">{e.start?.dateTime}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
