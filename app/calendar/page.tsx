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

      // ❌ blokada dla workera
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

  // 🔄 loading
  if (loading) {
    return <div className="p-6">Ładowanie...</div>;
  }

  // 🚫 blokada UI
  if (role === "worker") {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Brak dostępu</h1>
        <p className="text-gray-500 mt-2">
          Nie masz dostępu do kalendarza.
        </p>
      </div>
    );
  }

  // 🔌 brak połączenia
  if (!connected) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">Kalendarz</h1>

        <a
          href="/api/google/connect"
          className="px-4 py-2 bg-black text-white rounded"
        >
          Połącz z Google Calendar
        </a>
      </div>
    );
  }

  // ✅ normalny widok
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Kalendarz</h1>

      {events.length === 0 ? (
        <div>Brak wydarzeń</div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="border p-3 rounded bg-white">
              <div className="font-semibold">{e.summary}</div>
              <div className="text-sm text-gray-500">
                {e.start?.dateTime}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}