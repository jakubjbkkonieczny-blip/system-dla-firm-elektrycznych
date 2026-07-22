"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

type Notification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt?: string;
  url?: string | null;
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch("/api/notifications");
      setItems(data.notifications || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  if (!user) return null;

  return (
    <div className="w-full max-w-full min-w-0">
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Powiadomienia</h1>
          <p className="text-sm text-text-muted mt-1">Ostatnie alerty i aktualizacje</p>
        </div>

        {loading && <div className="text-text-muted">Ładowanie...</div>}

        {!loading && items.length === 0 && (
          <div className="theme-glass bg-card border border-border rounded-xl p-6 text-text-muted text-center">
            Brak powiadomień
          </div>
        )}

        <div className="space-y-3">
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.url && n.url.startsWith("/") ? n.url : "#"}
              className={[
                "block p-4 rounded-xl border min-h-[44px] transition",
                n.read
                  ? "theme-glass bg-card border-border hover:bg-card-hover"
                  : "bg-accent/10 border-accent/30 hover:bg-accent/15",
              ].join(" ")}
            >
              <div className="font-semibold text-text">{n.title}</div>
              <div className="text-sm text-text-muted mt-1">{n.body}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
